import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../../types/product.js'
import type { EnrichmentAdapter } from '../types.js'

const mockSearch = vi.fn()
const mockScrape = vi.fn()

vi.mock('@mendable/firecrawl-js', () => {
  class MockFirecrawl {
    search = mockSearch
    scrape = mockScrape
  }

  return { default: MockFirecrawl }
})

vi.mock('../../batch/retry.js', () => ({
  withRetry: vi.fn().mockImplementation(
    async <T>(fn: () => Promise<T>, _label: string): Promise<T> => fn(),
  ),
}))

import {
  buildJsonSchema,
  buildScrapePrompt,
  createFirecrawlAdapter,
  getCurrentTargetFields,
  getMissingFields,
  pickSearchResultUrl,
} from '../firecrawl-adapter.js'
import { withRetry } from '../../batch/retry.js'

const BASE_PRODUCT: Product = {
  sku: 'SKU-001',
  code: 'CODE-001',
  gtin: ['1234567890123'],
  name: 'Classic Leather Bag',
  brand: 'Gucci',
  color: 'Black',
  model: 'GG Marmont',
  price: 2500,
  sizes: [],
  errors: [],
  images: ['https://example.com/img1.jpg'],
  season: 'FW23',
  made_in: 'Italy',
  category: 'Bags',
  feed_name: 'test-feed',
  department: 'Women',
  product_id: 'PROD-001',
  season_year: '2023',
  color_original: 'Nero',
  made_in_original: 'Italia',
  category_original: 'Borse',
  materials_original: 'Pelle di vitello',
  department_original: 'Donna',
  unit_system_name_original: 'EU',
  year: '2023',
  collection: 'Fall Winter',
  dimensions: '',
  collection_original: 'Autunno Inverno',
  title: 'GG Marmont Classic Leather Bag',
  sizes_raw: '[]',
  season_raw: 'FW23',
  description: 'Descrizione originale italiana',
  size_system: 'EU',
  category_item: 'Shoulder Bags',
  season_display: 'Fall Winter 2023',
  sizes_original: '[]',
  vendor_product_id: 'VENDOR-001',
}

const SCRAPE_RESPONSE = {
  json: {
    description_eng: 'A structured luxury bag description.',
    dimensions: '26 x 15 x 7 cm',
    weight: '0.8 kg',
    additional_info: 'Features GG monogram hardware',
  },
}

describe('FireCrawl Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FIRECRAWL_API_KEY = 'test-api-key'
  })

  describe('helpers', () => {
    it('detects only missing target fields using source-field mapping rules', () => {
      const fields = getMissingFields(BASE_PRODUCT)

      expect(fields).toEqual(['description_eng', 'dimensions', 'weight', 'additional_info'])
    })

    it('treats materials_original as satisfying materials, and description as not satisfying description_eng', () => {
      const currentFields = getCurrentTargetFields(BASE_PRODUCT)

      expect(currentFields.materials).toBe('Pelle di vitello')
      expect(currentFields.description_eng).toBeUndefined()
    })

    it('builds JSON schema with only the requested fields', () => {
      const schema = buildJsonSchema(['description_eng', 'weight'])

      expect(Object.keys(schema.properties)).toEqual([
        'description_eng',
        'weight',
      ])
      expect(schema.required).toEqual(['description_eng', 'weight'])
      expect(schema.additionalProperties).toBe(false)
    })

    it('builds a scrape prompt that requests only missing fields', () => {
      const prompt = buildScrapePrompt(BASE_PRODUCT, [
        'description_eng',
        'weight',
      ])

      expect(prompt).toContain('description_eng')
      expect(prompt).toContain('weight')
      expect(prompt).not.toContain('materials')
    })

    it('prefers brand-domain URLs when selecting a search result', () => {
      const url = pickSearchResultUrl(
        [
          { url: 'https://shopping.google.com/product/1' },
          { url: 'https://www.gucci.com/us/en/pr/handbags/item' },
        ],
        BASE_PRODUCT,
      )

      expect(url).toBe('https://www.gucci.com/us/en/pr/handbags/item')
    })
  })

  describe('createFirecrawlAdapter', () => {
    it('returns object implementing EnrichmentAdapter with name firecrawl', () => {
      const adapter: EnrichmentAdapter = createFirecrawlAdapter()

      expect(adapter.name).toBe('firecrawl')
      expect(typeof adapter.enrich).toBe('function')
    })
  })

  describe('enrich()', () => {
    it('uses lens brand match URL as highest priority, skipping search', async () => {
      const lensData = JSON.stringify([
        {
          title: 'Gucci GG Marmont Bag',
          link: 'https://www.farfetch.com/gucci-bag/123',
          source: 'Farfetch',
        },
      ])
      const productWithLens = {
        ...BASE_PRODUCT,
        sku: 'SKU-LENS',
        lens_brand_matches: lensData,
      } as Product

      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(productWithLens)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockScrape).toHaveBeenCalledWith(
        'https://www.farfetch.com/gucci-bag/123',
        expect.objectContaining({
          formats: [
            expect.objectContaining({
              type: 'json',
              schema: expect.objectContaining({
                required: ['description_eng', 'dimensions', 'weight', 'additional_info'],
              }),
            }),
          ],
        }),
      )
      expect(result.status).toBe('success')
      expect(result.fillRate).toBe(1)
    })

    it('searches for a URL when no lens data, then performs one JSON scrape', async () => {
      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(BASE_PRODUCT)

      expect(mockSearch).toHaveBeenCalledWith(
        expect.stringContaining('Gucci'),
        expect.objectContaining({ limit: 3 }),
      )
      expect(mockSearch.mock.calls[0][1]).not.toHaveProperty('scrapeOptions')
      expect(mockScrape).toHaveBeenCalledWith(
        'https://www.gucci.com/us/en/pr/handbags/item',
        expect.any(Object),
      )
      expect(result.status).toBe('success')
    })

    it('falls back to Google Shopping search when primary search returns no usable URL', async () => {
      mockSearch
        .mockResolvedValueOnce({ web: [] })
        .mockResolvedValueOnce({
          web: [{ url: 'https://shopping.google.com/product/123' }],
        })
      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(BASE_PRODUCT)

      expect(mockSearch).toHaveBeenCalledTimes(2)
      expect(mockSearch.mock.calls[1][0]).toContain('site:shopping.google.com')
      expect(mockScrape).toHaveBeenCalledWith(
        'https://shopping.google.com/product/123',
        expect.any(Object),
      )
      expect(result.status).toBe('success')
    })

    it('skips FireCrawl entirely when no target fields are missing', async () => {
      const completeProduct = {
        ...BASE_PRODUCT,
        dimensions: '26 x 15 x 7 cm',
        description_eng: 'Already enriched',
        weight: '0.8 kg',
        additional_info: 'Features GG monogram hardware',
      } as Product

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(completeProduct)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockScrape).not.toHaveBeenCalled()
      expect(result.fields).toEqual({})
      expect(result.enrichedFields).toEqual([])
      expect(result.fillRate).toBe(1)
      expect(result.status).toBe('success')
    })

    it('returns only newly populated fields and computes fillRate from final merged completeness', async () => {
      const lensData = JSON.stringify([
        { title: 'Gucci Bag', link: 'https://www.farfetch.com/bag', source: 'Farfetch' },
      ])
      const productWithLens = {
        ...BASE_PRODUCT,
        lens_brand_matches: lensData,
      } as Product

      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Features GG monogram hardware',
          materials: 'Should be ignored because materials is not missing',
        },
      })

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(productWithLens)

      expect(result.fields).toEqual({
        description_eng: 'A structured luxury bag description.',
        dimensions: '26 x 15 x 7 cm',
        weight: '0.8 kg',
        additional_info: 'Features GG monogram hardware',
      })
      expect(result.enrichedFields).toEqual([
        'description_eng',
        'dimensions',
        'weight',
        'additional_info',
      ])
      expect(result.fillRate).toBe(1)
      expect(result.status).toBe('success')
    })

    it('returns failed with a clear error when no usable search result can be found', async () => {
      mockSearch
        .mockResolvedValueOnce({ web: [] })
        .mockResolvedValueOnce({ web: [] })

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(BASE_PRODUCT)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('No usable search results')
      expect(result.fillRate).toBeGreaterThan(0)
    })

    it('wraps both search and scrape API calls in withRetry', async () => {
      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      await adapter.enrich(BASE_PRODUCT)

      expect(withRetry).toHaveBeenCalledTimes(2)
      expect(withRetry).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        'firecrawl-search:SKU-001',
      )
      expect(withRetry).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        'firecrawl-scrape:SKU-001',
      )
    })

    it('falls through to search when lens matches are only stock photos', async () => {
      const stockData = JSON.stringify([
        {
          title: 'Stock photo bag',
          link: 'https://www.istockphoto.com/photo/bag-123',
          source: 'iStock',
        },
      ])
      const productWithStock = {
        ...BASE_PRODUCT,
        lens_brand_matches: stockData,
      } as Product

      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(productWithStock)

      expect(mockSearch).toHaveBeenCalled()
      expect(result.status).toBe('success')
    })

    it('falls through to search when lens data has error object', async () => {
      const errorData = JSON.stringify({ error: 'Provided image link cannot be opened' })
      const productWithError = {
        ...BASE_PRODUCT,
        lens_brand_matches: errorData,
        lens_all_matches: errorData,
      } as Product

      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue(SCRAPE_RESPONSE)

      const adapter = createFirecrawlAdapter()
      const result = await adapter.enrich(productWithError)

      expect(mockSearch).toHaveBeenCalled()
      expect(result.status).toBe('success')
    })
  })
})

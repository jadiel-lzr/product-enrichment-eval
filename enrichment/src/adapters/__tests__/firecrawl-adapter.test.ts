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

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi
      .fn()
      .mockImplementation((path: string, encoding?: BufferEncoding) => {
        if (typeof path === 'string' && path.includes('serpapi-urls.json')) {
          return JSON.stringify({
            'SKU-001': ['https://brand.com/product/sku-001'],
          })
        }

        return actual.readFileSync(path, encoding)
      }),
    existsSync: vi.fn().mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('serpapi-urls.json')) {
        return true
      }

      return actual.existsSync(path)
    }),
  }
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
import { existsSync, readFileSync } from 'node:fs'

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
    it('uses SerpAPI URL directly, skips search, and performs one JSON scrape', async () => {
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Features GG monogram hardware',
        },
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      const result = await adapter.enrich(BASE_PRODUCT)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockScrape).toHaveBeenCalledWith(
        'https://brand.com/product/sku-001',
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
      expect(result.enrichedFields).toEqual([
        'description_eng',
        'dimensions',
        'weight',
        'additional_info',
      ])
      expect(result.fillRate).toBe(1)
      expect(result.status).toBe('success')
    })

    it('searches for a URL first, then performs one JSON scrape without scrapeOptions on search', async () => {
      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Quilted chevron pattern',
        },
      })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/missing-serpapi.json')
      const productWithoutSerpApi = { ...BASE_PRODUCT, sku: 'SKU-NO-SERP' }
      const result = await adapter.enrich(productWithoutSerpApi)

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
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Quilted chevron pattern',
        },
      })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/missing-serpapi.json')
      const productWithoutSerpApi = { ...BASE_PRODUCT, sku: 'SKU-NO-SERP' }
      const result = await adapter.enrich(productWithoutSerpApi)

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

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/missing-serpapi.json')
      const result = await adapter.enrich(completeProduct)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockScrape).not.toHaveBeenCalled()
      expect(result.fields).toEqual({})
      expect(result.enrichedFields).toEqual([])
      expect(result.fillRate).toBe(1)
      expect(result.status).toBe('success')
    })

    it('returns only newly populated fields and computes fillRate from final merged completeness', async () => {
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Features GG monogram hardware',
          materials: 'Should be ignored because materials is not missing',
        },
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      const result = await adapter.enrich(BASE_PRODUCT)

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

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/missing-serpapi.json')
      const productWithoutSerpApi = { ...BASE_PRODUCT, sku: 'SKU-NO-SERP' }
      const result = await adapter.enrich(productWithoutSerpApi)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('No usable search results')
      expect(result.fillRate).toBeGreaterThan(0)
    })

    it('wraps both search and scrape API calls in withRetry', async () => {
      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Quilted chevron pattern',
        },
      })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/missing-serpapi.json')
      const productWithoutSerpApi = { ...BASE_PRODUCT, sku: 'SKU-NO-SERP' }
      await adapter.enrich(productWithoutSerpApi)

      expect(withRetry).toHaveBeenCalledTimes(2)
      expect(withRetry).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        'firecrawl-search:SKU-NO-SERP',
      )
      expect(withRetry).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        'firecrawl-scrape:SKU-NO-SERP',
      )
    })

    it('gracefully handles missing SerpAPI URLs file and proceeds with search', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file')
      })
      mockSearch.mockResolvedValue({
        web: [{ url: 'https://www.gucci.com/us/en/pr/handbags/item' }],
      })
      mockScrape.mockResolvedValue({
        json: {
          description_eng: 'A structured luxury bag description.',
          dimensions: '26 x 15 x 7 cm',
          weight: '0.8 kg',
          additional_info: 'Quilted chevron pattern',
        },
      })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const adapter = createFirecrawlAdapter('data/missing-file.json')
      const result = await adapter.enrich(BASE_PRODUCT)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SerpAPI'))
      expect(mockSearch).toHaveBeenCalled()
      expect(result.status).toBe('success')

      consoleSpy.mockRestore()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '../../types/product.js'
import type { EnrichmentAdapter } from '../types.js'

// Mock @mendable/firecrawl-js
const mockSearch = vi.fn()
const mockScrape = vi.fn()
vi.mock('@mendable/firecrawl-js', () => {
  class MockFirecrawl {
    search = mockSearch
    scrape = mockScrape
  }
  return { default: MockFirecrawl }
})

// Mock fs for serpApiUrls loading
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((path: string, encoding?: string) => {
      if (typeof path === 'string' && path.includes('serpapi-urls.json')) {
        return JSON.stringify({
          'SKU-001': ['https://brand.com/product/sku-001'],
          'SKU-002': ['https://brand.com/product/sku-002'],
        })
      }
      return actual.readFileSync(path, encoding as BufferEncoding)
    }),
    existsSync: vi.fn().mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('serpapi-urls.json')) {
        return true
      }
      return actual.existsSync(path)
    }),
  }
})

// Mock retry to call fn directly (no actual delays)
vi.mock('../../batch/retry.js', () => ({
  withRetry: vi.fn().mockImplementation(
    async <T>(fn: () => Promise<T>, _label: string): Promise<T> => fn(),
  ),
}))

import { createFirecrawlAdapter, parseMarkdownForFields } from '../firecrawl-adapter.js'
import { withRetry } from '../../batch/retry.js'
import { readFileSync, existsSync } from 'node:fs'

const MOCK_PRODUCT: Product = {
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
  description: '',
  size_system: 'EU',
  category_item: 'Shoulder Bags',
  season_display: 'Fall Winter 2023',
  sizes_original: '[]',
  vendor_product_id: 'VENDOR-001',
}

const MOCK_MARKDOWN = `
# Gucci GG Marmont Classic Leather Bag

## Product Details

This exquisite leather bag from Gucci's Fall Winter 2023 collection is crafted in Italy from premium calfskin leather.

- **Season:** FW23
- **Year:** 2023
- **Collection:** Fall Winter 2023
- **Materials:** Calfskin leather, gold-tone hardware
- **Made in:** Italy
- **Weight:** 0.8 kg
- **Dimensions:** 26 x 15 x 7 cm
- **GTIN:** 1234567890123

A timeless investment piece featuring the iconic GG hardware.
`

describe('FireCrawl Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FIRECRAWL_API_KEY = 'test-api-key'
  })

  describe('createFirecrawlAdapter', () => {
    it('returns object implementing EnrichmentAdapter with name firecrawl', () => {
      const adapter: EnrichmentAdapter = createFirecrawlAdapter()
      expect(adapter.name).toBe('firecrawl')
      expect(typeof adapter.enrich).toBe('function')
    })
  })

  describe('enrich() with SerpAPI URLs', () => {
    it('uses SerpAPI URL directly when serpApiUrls map contains the product SKU', async () => {
      mockScrape.mockResolvedValue({
        success: true,
        markdown: MOCK_MARKDOWN,
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(mockScrape).toHaveBeenCalledWith(
        'https://brand.com/product/sku-001',
        expect.objectContaining({ formats: ['markdown'] }),
      )
      expect(mockSearch).not.toHaveBeenCalled()
      expect(result.status).not.toBe('failed')
    })
  })

  describe('enrich() with brand site search', () => {
    it('searches brand site first when no SerpAPI URL available', async () => {
      const productWithoutSerpApi = { ...MOCK_PRODUCT, sku: 'SKU-NO-SERP' }

      mockSearch.mockResolvedValue({
        web: [{ markdown: MOCK_MARKDOWN, url: 'https://brand.com/product' }],
      })

      // Override existsSync to return false for serpapi
      vi.mocked(existsSync).mockImplementation(((path: string) => {
        if (typeof path === 'string' && path.includes('serpapi-urls.json')) return false
        return false
      }) as typeof existsSync)

      const adapter = createFirecrawlAdapter('data/serpapi-urls-nonexistent.json')
      const result = await adapter.enrich(productWithoutSerpApi)

      expect(mockSearch).toHaveBeenCalledWith(
        expect.stringContaining('Gucci'),
        expect.objectContaining({ limit: 3 }),
      )
      expect(result.status).not.toBe('failed')
    })

    it('falls back to Google Shopping search when brand site search returns no results', async () => {
      const productWithoutSerpApi = { ...MOCK_PRODUCT, sku: 'SKU-NO-SERP' }

      mockSearch
        .mockResolvedValueOnce({ web: [] }) // first search: empty
        .mockResolvedValueOnce({
          web: [{ markdown: MOCK_MARKDOWN, url: 'https://shopping.google.com/product' }],
        })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/serpapi-urls-nonexistent.json')
      const result = await adapter.enrich(productWithoutSerpApi)

      expect(mockSearch).toHaveBeenCalledTimes(2)
      // Second call should include site:shopping.google.com
      const secondCallQuery = mockSearch.mock.calls[1][0]
      expect(secondCallQuery).toContain('site:shopping.google.com')
      expect(result.status).not.toBe('failed')
    })
  })

  describe('markdown field extraction', () => {
    it('scrapes top search result as markdown and extracts enrichment fields', async () => {
      mockSearch.mockResolvedValue({
        web: [{ markdown: MOCK_MARKDOWN, url: 'https://brand.com/product' }],
      })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/serpapi-urls-nonexistent.json')
      const productWithoutSerpApi = { ...MOCK_PRODUCT, sku: 'SKU-NO-SERP' }
      const result = await adapter.enrich(productWithoutSerpApi)

      expect(result.fields.materials).toBeDefined()
      expect(result.fields.made_in).toBeDefined()
    })
  })

  describe('EnrichmentResult properties', () => {
    it('returns EnrichmentResult with correct fillRate and enrichedFields', async () => {
      mockScrape.mockResolvedValue({
        success: true,
        markdown: MOCK_MARKDOWN,
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.fillRate).toBeGreaterThan(0)
      expect(result.fillRate).toBeLessThanOrEqual(1)
      expect(result.enrichedFields.length).toBeGreaterThan(0)
      expect(result.status).toMatch(/^(success|partial)$/)
    })

    it('returns status failed when both search and fallback return no results', async () => {
      mockSearch
        .mockResolvedValueOnce({ web: [] })
        .mockResolvedValueOnce({ web: [] })

      vi.mocked(existsSync).mockReturnValue(false)

      const adapter = createFirecrawlAdapter('data/serpapi-urls-nonexistent.json')
      const productWithoutSerpApi = { ...MOCK_PRODUCT, sku: 'SKU-NO-SERP' }
      const result = await adapter.enrich(productWithoutSerpApi)

      expect(result.status).toBe('failed')
      expect(result.fillRate).toBe(0)
    })

    it('does NOT include accuracyScore (non-LLM tool)', async () => {
      mockScrape.mockResolvedValue({
        success: true,
        markdown: MOCK_MARKDOWN,
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.accuracyScore).toBeUndefined()
    })
  })

  describe('retry behavior', () => {
    it('wraps API calls in withRetry', async () => {
      mockScrape.mockResolvedValue({
        success: true,
        markdown: MOCK_MARKDOWN,
      })

      const adapter = createFirecrawlAdapter('data/serpapi-urls.json')
      await adapter.enrich(MOCK_PRODUCT)

      expect(withRetry).toHaveBeenCalled()
    })
  })

  describe('missing serpApiUrls file', () => {
    it('gracefully handles missing serpApiUrls file (logs warning, proceeds with search)', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file')
      })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockSearch.mockResolvedValue({
        web: [{ markdown: MOCK_MARKDOWN, url: 'https://brand.com/product' }],
      })

      const adapter = createFirecrawlAdapter('data/missing-file.json')
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SerpAPI'),
      )
      expect(mockSearch).toHaveBeenCalled()
      expect(result.status).not.toBe('failed')

      consoleSpy.mockRestore()
    })
  })
})

describe('parseMarkdownForFields', () => {
  it('extracts season from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.season).toBeDefined()
  })

  it('extracts materials from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.materials).toBeDefined()
  })

  it('extracts made_in from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.made_in).toBeDefined()
  })

  it('extracts weight from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.weight).toBeDefined()
  })

  it('extracts dimensions from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.dimensions).toBeDefined()
  })

  it('extracts description from markdown', () => {
    const fields = parseMarkdownForFields(MOCK_MARKDOWN, MOCK_PRODUCT)
    expect(fields.description_eng).toBeDefined()
  })

  it('returns empty object for empty markdown', () => {
    const fields = parseMarkdownForFields('', MOCK_PRODUCT)
    const filledKeys = Object.keys(fields).filter(
      (k) => fields[k as keyof typeof fields] !== undefined && fields[k as keyof typeof fields] !== '',
    )
    expect(filledKeys.length).toBe(0)
  })
})

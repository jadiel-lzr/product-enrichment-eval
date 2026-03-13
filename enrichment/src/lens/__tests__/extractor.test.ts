import { describe, it, expect } from 'vitest'
import type { Product } from '../../types/product.js'
import {
  extractLensMatches,
  filterUsableMatches,
  extractBrandMatches,
  extractAllMatches,
  getLensScrapingUrls,
  buildLensContextLines,
} from '../extractor.js'
import type { LensMatch } from '../types.js'

function createProduct(overrides: Record<string, unknown> = {}): Product {
  return {
    sku: 'SKU-001',
    code: 'CODE-001',
    gtin: [],
    name: 'Test Product',
    brand: 'Gucci',
    color: 'Black',
    model: 'GG Marmont',
    price: 2500,
    sizes: [],
    errors: [],
    images: [],
    season: '',
    made_in: '',
    category: 'Bags',
    feed_name: 'test',
    department: 'Women',
    product_id: 'PID-001',
    season_year: '',
    color_original: '',
    made_in_original: '',
    category_original: '',
    materials_original: '',
    department_original: '',
    unit_system_name_original: '',
    year: '',
    collection: '',
    dimensions: '',
    collection_original: '',
    title: '',
    sizes_raw: '[]',
    season_raw: '',
    description: '',
    size_system: '',
    category_item: '',
    season_display: '',
    sizes_original: '[]',
    vendor_product_id: '',
    ...overrides,
  } as Product
}

const VALID_MATCHES_JSON = JSON.stringify([
  {
    title: 'Gucci GG Marmont Bag',
    link: 'https://www.gucci.com/product/123',
    source: 'Gucci',
    thumbnail: 'https://example.com/thumb.jpg',
    price: '2500',
    rating: null,
    reviews: null,
  },
  {
    title: 'Gucci Marmont Shoulder Bag',
    link: 'https://www.nordstrom.com/s/gucci-bag/12345',
    source: 'Nordstrom',
    thumbnail: null,
    price: null,
    rating: null,
    reviews: null,
  },
])

const STOCK_PHOTO_MATCHES_JSON = JSON.stringify([
  {
    title: 'Black leather bag stock photo',
    link: 'https://www.istockphoto.com/photo/black-bag-123',
    source: 'iStock',
    thumbnail: null,
    price: null,
    rating: null,
    reviews: null,
  },
  {
    title: 'Leather handbag',
    link: 'https://www.gettyimages.com/detail/456',
    source: 'Getty Images',
    thumbnail: null,
    price: null,
    rating: null,
    reviews: null,
  },
])

describe('extractLensMatches', () => {
  it('parses valid JSON array of matches', () => {
    const product = createProduct({ lens_brand_matches: VALID_MATCHES_JSON })
    const matches = extractLensMatches(product, 'lens_brand_matches')

    expect(matches).toHaveLength(2)
    expect(matches[0]?.title).toBe('Gucci GG Marmont Bag')
    expect(matches[1]?.source).toBe('Nordstrom')
  })

  it('returns empty array for error object', () => {
    const product = createProduct({
      lens_all_matches: JSON.stringify({ error: 'Provided image link cannot be opened' }),
    })
    const matches = extractLensMatches(product, 'lens_all_matches')

    expect(matches).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    const product = createProduct({ lens_brand_matches: '' })
    expect(extractLensMatches(product, 'lens_brand_matches')).toHaveLength(0)
  })

  it('returns empty array for undefined column', () => {
    const product = createProduct()
    expect(extractLensMatches(product, 'lens_brand_matches')).toHaveLength(0)
  })

  it('returns empty array for empty JSON array', () => {
    const product = createProduct({ lens_brand_matches: '[]' })
    expect(extractLensMatches(product, 'lens_brand_matches')).toHaveLength(0)
  })

  it('returns empty array for invalid JSON', () => {
    const product = createProduct({ lens_brand_matches: 'not json at all' })
    expect(extractLensMatches(product, 'lens_brand_matches')).toHaveLength(0)
  })

  it('skips entries that fail schema validation', () => {
    const mixed = JSON.stringify([
      { title: 'Valid', link: 'https://example.com', source: 'Example' },
      { invalid: true },
      { title: 'Also Valid', link: 'https://other.com', source: 'Other' },
    ])
    const product = createProduct({ lens_all_matches: mixed })
    const matches = extractLensMatches(product, 'lens_all_matches')

    expect(matches).toHaveLength(2)
    expect(matches[0]?.title).toBe('Valid')
    expect(matches[1]?.title).toBe('Also Valid')
  })
})

describe('filterUsableMatches', () => {
  it('removes stock photo sources', () => {
    const matches: LensMatch[] = [
      { title: 'Real product', link: 'https://www.farfetch.com/product', source: 'Farfetch' },
      { title: 'Stock photo', link: 'https://www.istockphoto.com/photo/123', source: 'iStock' },
    ]

    const filtered = filterUsableMatches(matches)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.source).toBe('Farfetch')
  })

  it('removes entries with invalid URLs', () => {
    const matches: LensMatch[] = [
      { title: 'Valid', link: 'https://www.example.com/product', source: 'Example' },
      { title: 'Invalid', link: 'not-a-url', source: 'Bad' },
    ]

    const filtered = filterUsableMatches(matches)
    expect(filtered).toHaveLength(1)
  })

  it('filters by hostname when source name does not match', () => {
    const matches: LensMatch[] = [
      { title: 'Renamed source', link: 'https://www.shutterstock.com/image/123', source: 'SS Photos' },
    ]

    expect(filterUsableMatches(matches)).toHaveLength(0)
  })
})

describe('extractBrandMatches', () => {
  it('returns filtered brand matches', () => {
    const product = createProduct({ lens_brand_matches: VALID_MATCHES_JSON })
    const matches = extractBrandMatches(product)

    expect(matches).toHaveLength(2)
  })

  it('excludes stock photo matches', () => {
    const product = createProduct({ lens_brand_matches: STOCK_PHOTO_MATCHES_JSON })
    const matches = extractBrandMatches(product)

    expect(matches).toHaveLength(0)
  })
})

describe('getLensScrapingUrls', () => {
  it('returns unique URLs from brand matches first', () => {
    const product = createProduct({ lens_brand_matches: VALID_MATCHES_JSON })
    const urls = getLensScrapingUrls(product)

    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe('https://www.gucci.com/product/123')
    expect(urls[1]).toBe('https://www.nordstrom.com/s/gucci-bag/12345')
  })

  it('falls back to all matches when no brand matches', () => {
    const allMatches = JSON.stringify([
      { title: 'Product', link: 'https://www.farfetch.com/item/1', source: 'Farfetch' },
    ])
    const product = createProduct({
      lens_brand_matches: '[]',
      lens_all_matches: allMatches,
    })
    const urls = getLensScrapingUrls(product)

    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('https://www.farfetch.com/item/1')
  })

  it('caps at 3 URLs', () => {
    const many = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        title: `Product ${i}`,
        link: `https://www.store${i}.com/product`,
        source: `Store ${i}`,
      })),
    )
    const product = createProduct({ lens_brand_matches: many })
    const urls = getLensScrapingUrls(product)

    expect(urls).toHaveLength(3)
  })

  it('deduplicates URLs across brand and all matches', () => {
    const sameUrl = 'https://www.farfetch.com/product/1'
    const brandJson = JSON.stringify([
      { title: 'Brand Match', link: sameUrl, source: 'Farfetch' },
    ])
    const allJson = JSON.stringify([
      { title: 'All Match', link: sameUrl, source: 'Farfetch' },
      { title: 'Other', link: 'https://www.other.com/product', source: 'Other' },
    ])
    const product = createProduct({
      lens_brand_matches: brandJson,
      lens_all_matches: allJson,
    })
    const urls = getLensScrapingUrls(product)

    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe(sameUrl)
    expect(urls[1]).toBe('https://www.other.com/product')
  })

  it('returns empty array when no usable matches', () => {
    const product = createProduct({
      lens_brand_matches: STOCK_PHOTO_MATCHES_JSON,
      lens_all_matches: STOCK_PHOTO_MATCHES_JSON,
    })
    expect(getLensScrapingUrls(product)).toHaveLength(0)
  })
})

describe('buildLensContextLines', () => {
  it('formats brand matches as context lines', () => {
    const product = createProduct({ lens_brand_matches: VALID_MATCHES_JSON })
    const lines = buildLensContextLines(product)

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('- "Gucci GG Marmont Bag" via Gucci ($2500)')
    expect(lines[1]).toBe('- "Gucci Marmont Shoulder Bag" via Nordstrom')
  })

  it('caps at 5 lines', () => {
    const many = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        title: `Product ${i}`,
        link: `https://www.store${i}.com/product`,
        source: `Store ${i}`,
      })),
    )
    const product = createProduct({ lens_brand_matches: many })
    const lines = buildLensContextLines(product)

    expect(lines).toHaveLength(5)
  })

  it('falls back to all matches when no brand matches', () => {
    const allJson = JSON.stringify([
      { title: 'All Match Product', link: 'https://www.farfetch.com/item', source: 'Farfetch' },
    ])
    const product = createProduct({
      lens_brand_matches: '[]',
      lens_all_matches: allJson,
    })
    const lines = buildLensContextLines(product)

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('All Match Product')
  })

  it('returns empty array when no matches', () => {
    const product = createProduct()
    expect(buildLensContextLines(product)).toHaveLength(0)
  })
})

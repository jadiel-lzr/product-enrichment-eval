import { describe, it, expect } from 'vitest'
import { cleanProducts } from '../cleaner.js'
import type { Product } from '../../types/product.js'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: '1000',
    code: 'CODE-1000',
    gtin: [],
    name: 'Regular Product',
    brand: 'Real Brand',
    color: 'BLUE',
    model: 'MODEL-A',
    price: 100,
    sizes: [],
    errors: [],
    images: ['https://example.com/img.jpg'],
    season: '',
    made_in: '',
    category: '',
    feed_name: '',
    department: '',
    product_id: '',
    season_year: '',
    color_original: 'BLUE',
    made_in_original: '',
    category_original: '',
    materials_original: '',
    department_original: '',
    unit_system_name_original: '',
    year: '',
    collection: '',
    dimensions: '',
    collection_original: '',
    title: 'Product Title',
    sizes_raw: '',
    season_raw: '',
    description: '',
    size_system: '',
    category_item: '',
    season_display: '',
    sizes_original: '',
    vendor_product_id: '',
    ...overrides,
  }
}

describe('cleanProducts', () => {
  it('filters test products and returns correct count', () => {
    const products = [
      makeProduct({ sku: '1001', name: 'Good Product' }),
      makeProduct({ sku: '2083', name: 'Prodotto Test 1' }),
      makeProduct({ sku: '1002', name: 'Another Good' }),
      makeProduct({ sku: '2100', brand: 'Brand di prova' }),
    ]

    const result = cleanProducts(products)

    expect(result.cleanedProducts).toHaveLength(2)
    expect(result.report.totalInput).toBe(4)
    expect(result.report.totalOutput).toBe(2)
    expect(result.report.removed).toHaveLength(2)
  })

  it('normalizes all colors to lowercase', () => {
    const products = [
      makeProduct({ sku: '1001', color: 'BRIGHT RED' }),
      makeProduct({ sku: '1002', color: '  Dark Blue  ' }),
    ]

    const result = cleanProducts(products)

    expect(result.cleanedProducts[0].color).toBe('bright red')
    expect(result.cleanedProducts[1].color).toBe('dark blue')
  })

  it('preserves color_original unchanged', () => {
    const products = [
      makeProduct({
        sku: '1001',
        color: 'BRIGHT RED',
        color_original: 'BRIGHT RED',
      }),
    ]

    const result = cleanProducts(products)

    expect(result.cleanedProducts[0].color_original).toBe('BRIGHT RED')
  })

  it('computes _missing_fields from errors array length', () => {
    const products = [
      makeProduct({
        sku: '1001',
        errors: [
          { error: 'missing', field: 'category' },
          { error: 'missing', field: 'department' },
          { error: 'missing', field: 'materials_original' },
        ],
      }),
    ]

    const result = cleanProducts(products)

    expect(result.cleanedProducts[0]._missing_fields).toBe(3)
  })

  it('sets _has_images to false and _image_count to 0 as placeholders', () => {
    const products = [
      makeProduct({
        sku: '1001',
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      }),
    ]

    const result = cleanProducts(products)

    expect(result.cleanedProducts[0]._has_images).toBe(false)
    expect(result.cleanedProducts[0]._image_count).toBe(0)
  })

  it('generates cleaning report with normalization stats', () => {
    const products = [
      makeProduct({ sku: '1001', color: 'RED' }),
      makeProduct({ sku: '2083', name: 'Prodotto Test 1' }),
    ]

    const result = cleanProducts(products)

    expect(result.report.normalizationsApplied.colors).toBeGreaterThanOrEqual(1)
    expect(result.report.removed).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const products = [
      makeProduct({ sku: '1001', color: 'RED' }),
    ]
    const originalLength = products.length

    cleanProducts(products)

    expect(products).toHaveLength(originalLength)
    expect(products[0].color).toBe('RED')
  })
})

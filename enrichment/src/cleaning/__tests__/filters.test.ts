import { describe, it, expect } from 'vitest'
import { isTestProduct, filterTestProducts } from '../filters.js'
import type { Product } from '../../types/product.js'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: '1000',
    code: 'CODE-1000',
    gtin: [],
    name: 'Regular Product',
    brand: 'Real Brand',
    color: 'Blue',
    model: 'MODEL-A',
    price: 100,
    sizes: [],
    errors: [],
    images: [],
    season: '',
    made_in: '',
    category: '',
    feed_name: '',
    department: '',
    product_id: '',
    season_year: '',
    color_original: 'Blue',
    made_in_original: '',
    category_original: '',
    materials_original: '',
    department_original: '',
    unit_system_name_original: '',
    year: '',
    collection: '',
    dimensions: '',
    collection_original: '',
    title: 'Regular Product Title',
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

describe('isTestProduct', () => {
  it('returns true for products with name containing "Prodotto Test"', () => {
    const product = makeProduct({ name: 'Prodotto Test Something' })
    expect(isTestProduct(product)).toBe(true)
  })

  it('returns true for products with brand "Brand di prova"', () => {
    const product = makeProduct({ brand: 'Brand di prova' })
    expect(isTestProduct(product)).toBe(true)
  })

  it('returns false for normal products', () => {
    const product = makeProduct()
    expect(isTestProduct(product)).toBe(false)
  })

  it('returns false when name partially matches but is not test', () => {
    const product = makeProduct({ name: 'Product Testing Equipment' })
    expect(isTestProduct(product)).toBe(false)
  })
})

describe('filterTestProducts', () => {
  it('separates kept and removed products', () => {
    const products = [
      makeProduct({ sku: '1001', name: 'Good Product' }),
      makeProduct({ sku: '2083', name: 'Prodotto Test 1' }),
      makeProduct({ sku: '1002', name: 'Another Good' }),
      makeProduct({ sku: '2100', brand: 'Brand di prova' }),
    ]

    const result = filterTestProducts(products)

    expect(result.kept).toHaveLength(2)
    expect(result.removed).toHaveLength(2)
    expect(result.kept.map((p) => p.sku)).toEqual(['1001', '1002'])
  })

  it('includes reason for each removed product', () => {
    const products = [
      makeProduct({ sku: '2083', name: 'Prodotto Test 1' }),
      makeProduct({ sku: '2100', brand: 'Brand di prova' }),
    ]

    const result = filterTestProducts(products)

    expect(result.removed[0].sku).toBe('2083')
    expect(result.removed[0].reason).toContain('Prodotto Test')
    expect(result.removed[1].sku).toBe('2100')
    expect(result.removed[1].reason).toContain('Brand di prova')
  })

  it('returns all products as kept when no test products exist', () => {
    const products = [
      makeProduct({ sku: '1001' }),
      makeProduct({ sku: '1002' }),
    ]

    const result = filterTestProducts(products)

    expect(result.kept).toHaveLength(2)
    expect(result.removed).toHaveLength(0)
  })

  it('does not mutate the input array', () => {
    const products = [
      makeProduct({ sku: '1001' }),
      makeProduct({ sku: '2083', name: 'Prodotto Test 1' }),
    ]
    const originalLength = products.length

    filterTestProducts(products)

    expect(products).toHaveLength(originalLength)
  })
})

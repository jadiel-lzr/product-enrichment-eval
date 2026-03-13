import { describe, it, expect } from 'vitest'
import {
  normalizeColor,
  sanitizeTitle,
  normalizeProduct,
} from '../normalizers.js'
import type { Product } from '../../types/product.js'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: '1000',
    code: 'CODE-1000',
    gtin: [],
    name: '  Product Name  ',
    brand: 'Brand',
    color: 'GREENISH MOLD',
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
    color_original: 'GREENISH MOLD',
    made_in_original: '',
    category_original: '',
    materials_original: '',
    department_original: '',
    unit_system_name_original: '',
    year: '',
    collection: '',
    dimensions: '',
    collection_original: '',
    title: '  Product Title  ',
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

describe('normalizeColor', () => {
  it('lowercases and trims color', () => {
    const product = makeProduct({ color: '  GREENISH MOLD  ' })
    const result = normalizeColor(product)

    expect(result.color).toBe('greenish mold')
  })

  it('does NOT modify color_original', () => {
    const product = makeProduct({
      color: 'BLUE',
      color_original: 'BLUE',
    })
    const result = normalizeColor(product)

    expect(result.color).toBe('blue')
    expect(result.color_original).toBe('BLUE')
  })

  it('returns a new object (immutability)', () => {
    const product = makeProduct({ color: 'RED' })
    const result = normalizeColor(product)

    expect(result).not.toBe(product)
    expect(product.color).toBe('RED')
  })
})

describe('sanitizeTitle', () => {
  it('trims whitespace from title', () => {
    const product = makeProduct({ title: '  My Title  ' })
    const result = sanitizeTitle(product)

    expect(result.title).toBe('My Title')
  })

  it('trims whitespace from name', () => {
    const product = makeProduct({ name: '  My Name  ' })
    const result = sanitizeTitle(product)

    expect(result.name).toBe('My Name')
  })

  it('returns a new object (immutability)', () => {
    const product = makeProduct({ title: '  Title  ', name: '  Name  ' })
    const result = sanitizeTitle(product)

    expect(result).not.toBe(product)
    expect(product.title).toBe('  Title  ')
    expect(product.name).toBe('  Name  ')
  })
})

describe('normalizeProduct', () => {
  it('applies color normalization and title sanitization', () => {
    const product = makeProduct({
      color: 'BRIGHT RED',
      title: '  Product Title  ',
      name: '  Product Name  ',
    })
    const result = normalizeProduct(product)

    expect(result.color).toBe('bright red')
    expect(result.title).toBe('Product Title')
    expect(result.name).toBe('Product Name')
  })

  it('preserves color_original unchanged', () => {
    const product = makeProduct({
      color: 'DARK BLUE',
      color_original: 'DARK BLUE',
    })
    const result = normalizeProduct(product)

    expect(result.color_original).toBe('DARK BLUE')
  })

  it('returns a new object (immutability)', () => {
    const product = makeProduct()
    const result = normalizeProduct(product)

    expect(result).not.toBe(product)
  })
})

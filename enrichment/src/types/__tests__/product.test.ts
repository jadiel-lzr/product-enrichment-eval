import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import {
  ProductSchema,
  SizeEntrySchema,
  ErrorEntrySchema,
  EnrichedFieldsSchema,
} from '../index.js'

const VALID_SIZE_ENTRY = {
  Qty: 1,
  sku: '2083_[]36(1)',
  Size: '[]36(1)',
  Barcode: '',
  Currency: 'EUR',
  NetPrice: 1450,
  BrandReferencePrice: 0,
}

const VALID_ERROR_ENTRY = {
  error: 'missing_field',
  field: 'description_eng',
}

const VALID_PRODUCT_ROW = {
  sku: '85993',
  code: 'HAT51600CAMEL/NUT',
  gtin: ['2000026685067'],
  name: '',
  brand: 'HELEN KAMINSKI',
  color: 'Beige',
  model: 'HAT51600',
  price: '150',
  sizes: [VALID_SIZE_ENTRY],
  errors: [VALID_ERROR_ENTRY],
  images: ['https://adda.coralmatch.com/images/thumbs/0058392.jpeg'],
  season: 'FW23',
  made_in: 'LK',
  category: 'Hats',
  feed_name: '',
  department: 'female',
  product_id: '85993_autunnoinverno2023_al-duca-d-aosta-mestre',
  season_year: 'Autunno/Inverno 2023',
  color_original: '',
  made_in_original: 'LK',
  category_original: '',
  materials_original: "MAIN: 100% WOOL FELT, TRIM: 100% COW LEATHER, INNERBAND: 51% NYLON 42% COTTON 7% ELASTANE",
  department_original: '',
  unit_system_name_original: 'ALFABETICA',
  year: '2023',
  collection: 'Main',
  dimensions: ' ',
  collection_original: '',
  title: '',
  sizes_raw: '',
  season_raw: '',
  description: '',
  size_system: '',
  category_item: '',
  season_display: '',
  sizes_original: '',
  vendor_product_id: '',
}

describe('SizeEntrySchema', () => {
  it('validates a well-formed size entry', () => {
    const result = SizeEntrySchema.parse(VALID_SIZE_ENTRY)
    expect(result.Qty).toBe(1)
    expect(result.sku).toBe('2083_[]36(1)')
    expect(result.Currency).toBe('EUR')
    expect(result.NetPrice).toBe(1450)
  })

  it('rejects a size entry missing required fields', () => {
    expect(() => SizeEntrySchema.parse({ Qty: 1 })).toThrow(ZodError)
  })
})

describe('ErrorEntrySchema', () => {
  it('validates a well-formed error entry', () => {
    const result = ErrorEntrySchema.parse(VALID_ERROR_ENTRY)
    expect(result.error).toBe('missing_field')
    expect(result.field).toBe('description_eng')
  })

  it('rejects an error entry missing required fields', () => {
    expect(() => ErrorEntrySchema.parse({ error: 'missing_field' })).toThrow(ZodError)
  })
})

describe('ProductSchema', () => {
  it('validates a complete product row with all 37 fields', () => {
    const result = ProductSchema.parse(VALID_PRODUCT_ROW)
    expect(result.sku).toBe('85993')
    expect(result.brand).toBe('HELEN KAMINSKI')
    expect(result.gtin).toEqual(['2000026685067'])
    expect(result.sizes).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.images).toHaveLength(1)
  })

  it('coerces price from string to number', () => {
    const result = ProductSchema.parse(VALID_PRODUCT_ROW)
    expect(result.price).toBe(150)
    expect(typeof result.price).toBe('number')
  })

  it('coerces price from string "123.45" to number 123.45', () => {
    const row = { ...VALID_PRODUCT_ROW, price: '123.45' }
    const result = ProductSchema.parse(row)
    expect(result.price).toBe(123.45)
  })

  it('rejects rows with missing required string fields (undefined)', () => {
    const row = { ...VALID_PRODUCT_ROW, sku: undefined }
    expect(() => ProductSchema.parse(row)).toThrow(ZodError)
  })

  it('allows empty strings for string fields', () => {
    const row = { ...VALID_PRODUCT_ROW, name: '' }
    const result = ProductSchema.parse(row)
    expect(result.name).toBe('')
  })

  it('allows passthrough of unexpected columns', () => {
    const row = { ...VALID_PRODUCT_ROW, unexpected_column: 'some value' }
    const result = ProductSchema.parse(row)
    expect((result as Record<string, unknown>).unexpected_column).toBe('some value')
  })

  it('accepts product without computed metadata fields', () => {
    const result = ProductSchema.parse(VALID_PRODUCT_ROW)
    expect(result._missing_fields).toBeUndefined()
    expect(result._has_images).toBeUndefined()
    expect(result._image_count).toBeUndefined()
  })

  it('accepts product with computed metadata fields', () => {
    const row = {
      ...VALID_PRODUCT_ROW,
      _missing_fields: 3,
      _has_images: true,
      _image_count: 2,
    }
    const result = ProductSchema.parse(row)
    expect(result._missing_fields).toBe(3)
    expect(result._has_images).toBe(true)
    expect(result._image_count).toBe(2)
  })
})

describe('EnrichedFieldsSchema', () => {
  it('validates a complete set of enriched fields', () => {
    const fields = {
      description_eng: 'A beautiful hat',
      season: 'FW23',
      year: '2023',
      collection: 'Main',
      gtin: '2000026685067',
      dimensions: '30x20x10',
    }
    const result = EnrichedFieldsSchema.parse(fields)
    expect(result.description_eng).toBe('A beautiful hat')
    expect(result.dimensions).toBe('30x20x10')
  })

  it('accepts partial enriched fields (all optional)', () => {
    const partial = { description_eng: 'A beautiful hat' }
    const result = EnrichedFieldsSchema.parse(partial)
    expect(result.description_eng).toBe('A beautiful hat')
    expect(result.season).toBeUndefined()
  })

  it('accepts empty object', () => {
    const result = EnrichedFieldsSchema.parse({})
    expect(result).toBeDefined()
  })

  it('allows unknown fields via passthrough (hybrid approach for LLM extras)', () => {
    const fields = {
      description_eng: 'A beautiful hat',
      unknown_field: 'extra LLM discovery',
    }
    const result = EnrichedFieldsSchema.parse(fields)
    expect(result.description_eng).toBe('A beautiful hat')
    expect((result as Record<string, unknown>).unknown_field).toBe('extra LLM discovery')
  })
})

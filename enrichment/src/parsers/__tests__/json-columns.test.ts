import { describe, it, expect } from 'vitest'
import { parseJsonColumns, JSON_COLUMNS } from '../json-columns.js'

describe('JSON_COLUMNS', () => {
  it('contains the 4 JSON column names', () => {
    expect(JSON_COLUMNS).toEqual(['gtin', 'sizes', 'errors', 'images'])
  })
})

describe('parseJsonColumns', () => {
  it('parses valid JSON strings for each column', () => {
    const raw = {
      sku: '12345',
      gtin: '["2000026685067"]',
      sizes: '[{"Qty":1,"sku":"12345","Size":"36","Barcode":"","Currency":"EUR","NetPrice":100,"BrandReferencePrice":0}]',
      errors: '[{"error":"missing_field","field":"description_eng"}]',
      images: '["https://example.com/img1.jpg","https://example.com/img2.jpg"]',
      name: 'Test Product',
    }

    const result = parseJsonColumns(raw)

    expect(result.gtin).toEqual(['2000026685067'])
    expect(result.sizes).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.images).toHaveLength(2)
  })

  it('returns empty arrays for "[]" values', () => {
    const raw = {
      sku: '12345',
      gtin: '[]',
      sizes: '[]',
      errors: '[]',
      images: '[]',
    }

    const result = parseJsonColumns(raw)

    expect(result.gtin).toEqual([])
    expect(result.sizes).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.images).toEqual([])
  })

  it('returns empty arrays for empty string values', () => {
    const raw = {
      sku: '12345',
      gtin: '',
      sizes: '',
      errors: '',
      images: '',
    }

    const result = parseJsonColumns(raw)

    expect(result.gtin).toEqual([])
    expect(result.sizes).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.images).toEqual([])
  })

  it('throws descriptive error for malformed JSON with column name', () => {
    const raw = {
      sku: '12345',
      gtin: '[]',
      sizes: '{invalid json',
      errors: '[]',
      images: '[]',
    }

    expect(() => parseJsonColumns(raw)).toThrow(/sizes/)
  })

  it('passes non-JSON columns through unchanged', () => {
    const raw = {
      sku: '12345',
      name: 'Test Product',
      brand: 'Test Brand',
      gtin: '[]',
      sizes: '[]',
      errors: '[]',
      images: '[]',
    }

    const result = parseJsonColumns(raw)

    expect(result.sku).toBe('12345')
    expect(result.name).toBe('Test Product')
    expect(result.brand).toBe('Test Brand')
  })

  it('does not mutate the original row object', () => {
    const raw = {
      sku: '12345',
      gtin: '["123"]',
      sizes: '[]',
      errors: '[]',
      images: '[]',
    }

    parseJsonColumns(raw)

    expect(raw.gtin).toBe('["123"]')
    expect(typeof raw.gtin).toBe('string')
  })
})

import { describe, it, expect } from 'vitest'
import { EnrichedFieldsSchema, type EnrichedFields, ENRICHMENT_TARGET_FIELDS } from '../../types/enriched.js'
import {
  computeFillRate,
  buildEnrichmentMetadata,
  type EnrichmentResult,
  type EnrichmentAdapter,
  type EnrichmentMetadata,
  type ImageInput,
} from '../types.js'

describe('EnrichedFieldsSchema', () => {
  it('validates object with all 12 target fields', () => {
    const input = {
      title: 'GG Marmont Shoulder Bag',
      description_eng: 'A luxury leather bag',
      season: 'FW23',
      year: '2023',
      collection: 'Fall/Winter',
      gtin: '1234567890123',
      dimensions: '30x20x10cm',
      made_in: 'Italy',
      materials: 'Full-grain leather',
      weight: '1.2kg',
      color: 'Black',
      additional_info: 'Dry clean only',
    }
    const result = EnrichedFieldsSchema.parse(input)
    expect(result.description_eng).toBe('A luxury leather bag')
    expect(result.made_in).toBe('Italy')
    expect(result.materials).toBe('Full-grain leather')
    expect(result.weight).toBe('1.2kg')
  })

  it('accepts accuracy_score as integer 1-10', () => {
    const input = { accuracy_score: 7 }
    const result = EnrichedFieldsSchema.parse(input)
    expect(result.accuracy_score).toBe(7)
  })

  it('rejects accuracy_score outside 1-10 range', () => {
    expect(() => EnrichedFieldsSchema.parse({ accuracy_score: 0 })).toThrow()
    expect(() => EnrichedFieldsSchema.parse({ accuracy_score: 11 })).toThrow()
    expect(() => EnrichedFieldsSchema.parse({ accuracy_score: 5.5 })).toThrow()
  })

  it('allows all fields to be undefined (partial enrichment)', () => {
    const result = EnrichedFieldsSchema.parse({})
    expect(result).toBeDefined()
    expect(result.description_eng).toBeUndefined()
    expect(result.made_in).toBeUndefined()
  })

  it('allows additional string fields via passthrough (hybrid approach)', () => {
    const input = {
      description_eng: 'Test',
      custom_field: 'extra value',
      another_field: 42,
    }
    const result = EnrichedFieldsSchema.parse(input)
    expect((result as Record<string, unknown>).custom_field).toBe('extra value')
    expect((result as Record<string, unknown>).another_field).toBe(42)
  })
})

describe('ENRICHMENT_TARGET_FIELDS', () => {
  it('contains exactly 12 field names', () => {
    expect(ENRICHMENT_TARGET_FIELDS).toHaveLength(12)
    expect(ENRICHMENT_TARGET_FIELDS).toContain('title')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('description_eng')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('season')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('year')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('collection')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('gtin')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('dimensions')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('made_in')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('materials')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('weight')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('color')
    expect(ENRICHMENT_TARGET_FIELDS).toContain('additional_info')
  })
})

describe('EnrichmentResult type', () => {
  it('has correct shape (fields, status, fillRate, enrichedFields, accuracyScore, error)', () => {
    const result: EnrichmentResult = {
      fields: { description_eng: 'Test', season: 'FW23' },
      status: 'success',
      fillRate: 0.67,
      enrichedFields: ['description_eng', 'season'],
      accuracyScore: 8,
      error: undefined,
    }
    expect(result.fields.description_eng).toBe('Test')
    expect(result.status).toBe('success')
    expect(result.fillRate).toBe(0.67)
    expect(result.enrichedFields).toEqual(['description_eng', 'season'])
    expect(result.accuracyScore).toBe(8)
    expect(result.error).toBeUndefined()
  })
})

describe('computeFillRate', () => {
  it('returns correct percentage for partial enrichment (e.g., 6/12 = 0.5)', () => {
    const fields: EnrichedFields = {
      description_eng: 'A luxury bag',
      season: 'FW23',
      year: '2023',
      collection: 'Fall/Winter',
      gtin: '1234567890123',
      dimensions: '30x20x10cm',
      // title, made_in, materials, weight, color, additional_info left undefined
    }
    expect(computeFillRate(fields)).toBe(0.5)
  })

  it('returns 0 for empty fields', () => {
    expect(computeFillRate({})).toBe(0)
  })

  it('returns 1.0 for all filled', () => {
    const fields: EnrichedFields = {
      title: 'GG Marmont Bag',
      description_eng: 'Test',
      season: 'FW23',
      year: '2023',
      collection: 'Fall',
      gtin: '123',
      dimensions: '10x10',
      made_in: 'Italy',
      materials: 'Leather',
      weight: '1kg',
      color: 'Black',
      additional_info: 'Dry clean only',
    }
    expect(computeFillRate(fields)).toBe(1)
  })

  it('ignores empty strings as unfilled', () => {
    const fields: EnrichedFields = {
      description_eng: 'Test',
      season: '',
      year: '',
    }
    expect(computeFillRate(fields)).toBeCloseTo(1 / 12, 2)
  })
})

describe('buildEnrichmentMetadata', () => {
  it('produces correct metadata object from EnrichmentResult', () => {
    const result: EnrichmentResult = {
      fields: { description_eng: 'Test', season: 'FW23', made_in: 'Italy' },
      status: 'success',
      fillRate: 0.33,
      enrichedFields: ['description_eng', 'season', 'made_in'],
      accuracyScore: 7,
    }

    const metadata = buildEnrichmentMetadata('claude', result)

    expect(metadata._enrichment_tool).toBe('claude')
    expect(metadata._enrichment_status).toBe('success')
    expect(metadata._enrichment_fill_rate).toBe(0.33)
    expect(metadata._enriched_fields).toBe('description_eng,season,made_in')
    expect(metadata._enrichment_error).toBe('')
    expect(metadata._enrichment_accuracy_score).toBe('7')
  })

  it('handles failed result with error', () => {
    const result: EnrichmentResult = {
      fields: {},
      status: 'failed',
      fillRate: 0,
      enrichedFields: [],
      error: 'API timeout',
    }

    const metadata = buildEnrichmentMetadata('gemini', result)

    expect(metadata._enrichment_tool).toBe('gemini')
    expect(metadata._enrichment_status).toBe('failed')
    expect(metadata._enrichment_fill_rate).toBe(0)
    expect(metadata._enriched_fields).toBe('')
    expect(metadata._enrichment_error).toBe('API timeout')
    expect(metadata._enrichment_accuracy_score).toBe('')
  })
})

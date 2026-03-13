import { describe, it, expect } from 'vitest'
import { buildEnrichmentPrompt } from '../enrichment-prompt.js'
import type { Product } from '../../types/product.js'

const makeProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    sku: '85993',
    code: 'HAT51600CAMEL/NUT',
    gtin: ['2000026685067'],
    name: 'Provence 12 Hat',
    brand: 'HELEN KAMINSKI',
    color: 'Beige',
    model: 'HAT51600',
    price: 150,
    sizes: [],
    errors: [],
    images: ['https://example.com/img.jpg'],
    season: 'FW23',
    made_in: 'LK',
    category: 'Hats',
    feed_name: '',
    department: 'female',
    product_id: '85993_autunnoinverno2023',
    season_year: 'Autunno/Inverno 2023',
    color_original: '',
    made_in_original: 'LK',
    category_original: '',
    materials_original: '100% WOOL FELT',
    department_original: '',
    unit_system_name_original: 'ALFABETICA',
    year: '2023',
    collection: 'Main',
    dimensions: '',
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
    ...overrides,
  }) as Product

describe('buildEnrichmentPrompt', () => {
  it('returns string containing product brand, name, and field instructions', () => {
    const product = makeProduct()
    const prompt = buildEnrichmentPrompt(product)

    expect(prompt).toContain('HELEN KAMINSKI')
    expect(prompt).toContain('Provence 12 Hat')
    expect(prompt).toContain('description_eng')
    expect(prompt).toContain('season')
    expect(prompt).toContain('year')
    expect(prompt).toContain('collection')
    expect(prompt).toContain('gtin')
    expect(prompt).toContain('dimensions')
    expect(prompt).toContain('made_in')
    expect(prompt).toContain('materials')
    expect(prompt).toContain('weight')
    expect(prompt).toContain('color')
    expect(prompt).toContain('additional_info')
    expect(prompt).toContain('accuracy_score')
  })

  it('includes existing field values as context (e.g., "season is currently FW23")', () => {
    const product = makeProduct({ season: 'FW23', year: '2023', collection: 'Main' })
    const prompt = buildEnrichmentPrompt(product)

    expect(prompt).toContain('FW23')
    expect(prompt).toContain('2023')
    expect(prompt).toContain('Main')
  })

  it('includes confidence strategy instructions (conservative for factual, aggressive for generative)', () => {
    const product = makeProduct()
    const prompt = buildEnrichmentPrompt(product)

    // Conservative for factual fields
    expect(prompt).toMatch(/gtin.*leave blank|leave blank.*gtin|factual.*leave blank|uncertain/i)
    // Aggressive for generative fields
    expect(prompt).toMatch(/description_eng.*always attempt|always attempt.*fill|generative.*attempt/i)
  })

  it('includes description tone instruction for luxury e-commerce', () => {
    const product = makeProduct()
    const prompt = buildEnrichmentPrompt(product)

    expect(prompt).toMatch(/luxury|NET-A-PORTER|SSENSE|e-commerce|professional/i)
    expect(prompt).toMatch(/2-3 sentences/i)
  })

  it('requests JSON output with 11 target fields + accuracy_score', () => {
    const product = makeProduct()
    const prompt = buildEnrichmentPrompt(product)

    expect(prompt).toMatch(/JSON/i)
    expect(prompt).toContain('accuracy_score')
    expect(prompt).toMatch(/1.*10|1-10/)
  })
})

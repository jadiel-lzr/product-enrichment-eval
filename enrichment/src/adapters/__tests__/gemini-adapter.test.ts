import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '../../types/product.js'

// Mock the Google GenAI SDK
const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent }
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
  }
})

// Mock the retry module to skip delays
vi.mock('../../batch/retry.js', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}))

// Mock the prompt builder
vi.mock('../../prompts/enrichment-prompt.js', () => ({
  buildEnrichmentPrompt: vi.fn(() => 'Test enrichment prompt'),
}))

const SAMPLE_PRODUCT: Product = {
  sku: 'SKU-002',
  code: 'CODE-002',
  gtin: ['9876543210987'],
  name: 'Silk Scarf',
  brand: 'Hermes',
  color: 'Orange',
  model: 'H-200',
  price: 800,
  sizes: [],
  errors: [],
  images: ['https://example.com/scarf1.jpg'],
  season: 'SS24',
  made_in: 'France',
  category: 'Accessories',
  feed_name: 'test-feed',
  department: 'Women',
  product_id: 'PROD-002',
  season_year: '2024',
  color_original: 'Orange',
  made_in_original: 'France',
  category_original: 'Accessoires',
  materials_original: 'Soie',
  department_original: 'Femme',
  unit_system_name_original: 'EU',
  year: '2024',
  collection: 'Spring Summer',
  dimensions: '',
  collection_original: 'Printemps Ete',
  title: 'Hermes Silk Scarf',
  sizes_raw: '[]',
  season_raw: 'SS24',
  description: '',
  size_system: 'EU',
  category_item: 'Scarf',
  season_display: 'Spring Summer 2024',
  sizes_original: '[]',
  vendor_product_id: 'VND-002',
}

const FULL_ENRICHMENT_RESPONSE = {
  description_eng: 'An exquisite silk scarf handcrafted in France.',
  season: 'Spring Summer 2024',
  year: '2024',
  collection: 'Carre Collection',
  gtin: '9876543210987',
  dimensions: '90x90cm',
  made_in: 'France',
  materials: '100% Silk',
  weight: '0.1kg',
  accuracy_score: 9,
}

const PARTIAL_ENRICHMENT_RESPONSE = {
  description_eng: 'A beautiful silk scarf.',
  season: 'Spring Summer 2024',
  year: '',
  collection: '',
  gtin: '',
  dimensions: '',
  made_in: 'France',
  materials: '100% Silk',
  weight: '',
  accuracy_score: 6,
}

function buildGeminiResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
  }
}

describe('Gemini Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GEMINI_MODEL
  })

  it('createGeminiAdapter returns object implementing EnrichmentAdapter with name "gemini"', async () => {
    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    expect(adapter.name).toBe('gemini')
    expect(typeof adapter.enrich).toBe('function')
  })

  it('enrich() calls generateContent with inlineData image parts + text part when images provided', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    const images = [
      { data: Buffer.from('fake-image-data'), mimeType: 'image/jpeg' },
      { data: Buffer.from('another-image'), mimeType: 'image/png' },
    ] as const

    await adapter.enrich(SAMPLE_PRODUCT, images)

    expect(mockGenerateContent).toHaveBeenCalledOnce()
    const callArgs = mockGenerateContent.mock.calls[0][0]

    // Verify contents contain inlineData parts
    const contents = callArgs.contents
    const inlineDataParts = contents.filter((p: Record<string, unknown>) => p.inlineData)
    const textParts = contents.filter((p: Record<string, unknown>) => p.text)

    expect(inlineDataParts).toHaveLength(2)
    expect(inlineDataParts[0].inlineData.mimeType).toBe('image/jpeg')
    expect(inlineDataParts[0].inlineData.data).toBe(Buffer.from('fake-image-data').toString('base64'))
    expect(inlineDataParts[1].inlineData.mimeType).toBe('image/png')
    expect(textParts).toHaveLength(1)
  })

  it('enrich() calls generateContent with text-only part when no images provided', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    expect(mockGenerateContent).toHaveBeenCalledOnce()
    const callArgs = mockGenerateContent.mock.calls[0][0]
    const contents = callArgs.contents

    const textParts = contents.filter((p: Record<string, unknown>) => p.text)
    const inlineDataParts = contents.filter((p: Record<string, unknown>) => p.inlineData)

    expect(textParts).toHaveLength(1)
    expect(inlineDataParts).toHaveLength(0)
  })

  it('enrich() uses config.responseMimeType="application/json" and config.responseJsonSchema', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    const callArgs = mockGenerateContent.mock.calls[0][0]
    expect(callArgs.config).toBeDefined()
    expect(callArgs.config.responseMimeType).toBe('application/json')
    expect(callArgs.config.responseJsonSchema).toBeDefined()
  })

  it('enrich() converts Zod schema to JSON Schema via zod-to-json-schema for responseSchema', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    const callArgs = mockGenerateContent.mock.calls[0][0]
    const schema = callArgs.config.responseJsonSchema

    // JSON Schema should have type "object" and properties matching our schema
    expect(schema.type).toBe('object')
    expect(schema.properties).toBeDefined()
    expect(schema.properties.description_eng).toBeDefined()
    expect(schema.properties.accuracy_score).toBeDefined()
  })

  it('enrich() returns EnrichmentResult with correct fillRate, enrichedFields, and accuracyScore on success', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('success')
    expect(result.fillRate).toBe(1.0)
    expect(result.accuracyScore).toBe(9)
    expect(result.enrichedFields).toContain('description_eng')
    expect(result.enrichedFields).toContain('made_in')
    expect(result.enrichedFields).toContain('materials')
    expect(result.enrichedFields.length).toBe(9)
    expect(result.fields.description_eng).toBe('An exquisite silk scarf handcrafted in France.')
  })

  it('enrich() returns status "partial" when some fields filled', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(PARTIAL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('partial')
    expect(result.fillRate).toBeGreaterThan(0)
    expect(result.fillRate).toBeLessThan(1.0)
    expect(result.accuracyScore).toBe(6)
  })

  it('enrich() returns status "failed" with error on API failure', async () => {
    const { withRetry } = await import('../../batch/retry.js')
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('Gemini quota exceeded'))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('failed')
    expect(result.fillRate).toBe(0)
    expect(result.enrichedFields).toEqual([])
    expect(result.error).toBe('Gemini quota exceeded')
  })

  it('enrich() wraps API call in withRetry for automatic retry with backoff', async () => {
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { withRetry } = await import('../../batch/retry.js')
    vi.mocked(withRetry).mockImplementation(async (fn) => fn())

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    expect(withRetry).toHaveBeenCalledOnce()
    expect(vi.mocked(withRetry).mock.calls[0][1]).toContain('gemini')
  })

  it('enrich() uses model from env var GEMINI_MODEL or defaults to "gemini-2.5-flash"', async () => {
    // Test default model
    mockGenerateContent.mockResolvedValue(buildGeminiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createGeminiAdapter } = await import('../gemini-adapter.js')
    const adapter = createGeminiAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    let callArgs = mockGenerateContent.mock.calls[0][0]
    expect(callArgs.model).toBe('gemini-2.5-flash')

    // Test env var override
    mockGenerateContent.mockClear()
    process.env.GEMINI_MODEL = 'gemini-2.5-pro'

    const mod2 = await import('../gemini-adapter.js')
    const adapter2 = mod2.createGeminiAdapter()

    await adapter2.enrich(SAMPLE_PRODUCT)

    callArgs = mockGenerateContent.mock.calls[0][0]
    expect(callArgs.model).toBe('gemini-2.5-pro')
  })
})

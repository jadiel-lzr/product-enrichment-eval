import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '../../types/product.js'
import type { EnrichmentAdapter } from '../types.js'

// Mock openai
const mockCreate = vi.fn()
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    constructor(public config: { apiKey?: string; baseURL?: string }) {}
  }
  return { default: MockOpenAI }
})

// Mock retry to call fn directly (no actual delays)
vi.mock('../../batch/retry.js', () => ({
  withRetry: vi.fn().mockImplementation(
    async <T>(fn: () => Promise<T>, _label: string): Promise<T> => fn(),
  ),
}))

// Mock buildEnrichmentPrompt
vi.mock('../../prompts/enrichment-prompt.js', () => ({
  buildEnrichmentPrompt: vi.fn().mockReturnValue('Mocked enrichment prompt text'),
}))

import { createGptAdapter } from '../gpt-adapter.js'
import { withRetry } from '../../batch/retry.js'
import { buildEnrichmentPrompt } from '../../prompts/enrichment-prompt.js'

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

const MOCK_ENRICHED_JSON = {
  title: 'GG Marmont Small Matelasse Shoulder Bag',
  description_eng: 'A luxurious leather bag from Gucci.',
  season: 'FW23',
  year: '2023',
  collection: 'Fall Winter 2023',
  gtin: '1234567890123',
  dimensions: '26 x 15 x 7 cm',
  made_in: 'Italy',
  materials: 'Calfskin leather',
  weight: '0.8 kg',
  color: 'Black',
  additional_info: 'Features GG monogram hardware',
  accuracy_score: 8,
}

function makeMockResponse(content: string) {
  return {
    choices: [
      {
        message: { content },
        finish_reason: 'stop',
      },
    ],
  }
}

describe('GPT Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-openai-key'
    delete process.env.GPT_MODEL
  })

  describe('createGptAdapter', () => {
    it('returns object implementing EnrichmentAdapter with name gpt', () => {
      const adapter: EnrichmentAdapter = createGptAdapter()
      expect(adapter.name).toBe('gpt')
      expect(typeof adapter.enrich).toBe('function')
    })
  })

  describe('API configuration', () => {
    it('calls chat.completions.create with default model gpt-5.2', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      await adapter.enrich(MOCK_PRODUCT)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.2',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
          ]),
        }),
      )
    })

    it('uses response_format with json_schema for structured output', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      await adapter.enrich(MOCK_PRODUCT)

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.response_format).toBeDefined()
      expect(callArgs.response_format.type).toBe('json_schema')
      expect(callArgs.response_format.json_schema).toBeDefined()
      expect(callArgs.response_format.json_schema.name).toBe('enriched_product')
    })

    it('sends product identifiers via buildEnrichmentPrompt', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      await adapter.enrich(MOCK_PRODUCT)

      expect(buildEnrichmentPrompt).toHaveBeenCalledWith(MOCK_PRODUCT)
    })
  })

  describe('EnrichmentResult properties', () => {
    it('returns EnrichmentResult with correct fillRate and enrichedFields', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.fillRate).toBeGreaterThan(0)
      expect(result.fillRate).toBeLessThanOrEqual(1)
      expect(result.enrichedFields.length).toBeGreaterThan(0)
      expect(result.status).toMatch(/^(success|partial)$/)
    })

    it('includes accuracyScore from response', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.accuracyScore).toBe(8)
    })

    it('returns status failed with error on API failure', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'))

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('API rate limit exceeded')
      expect(result.fillRate).toBe(0)
    })
  })

  describe('retry behavior', () => {
    it('wraps API call in withRetry', async () => {
      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      await adapter.enrich(MOCK_PRODUCT)

      expect(withRetry).toHaveBeenCalled()
    })
  })

  describe('model configuration', () => {
    it('uses model from env var GPT_MODEL or defaults to gpt-5.2', async () => {
      process.env.GPT_MODEL = 'gpt-5.2-pro'

      mockCreate.mockResolvedValue(makeMockResponse(JSON.stringify(MOCK_ENRICHED_JSON)))

      const adapter = createGptAdapter()
      await adapter.enrich(MOCK_PRODUCT)

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.model).toBe('gpt-5.2-pro')
    })
  })

  describe('JSON parse fallback', () => {
    it('handles JSON parse failure gracefully by extracting JSON from free-text response', async () => {
      const freeTextResponse = `Here are the enriched fields for the product:

${JSON.stringify(MOCK_ENRICHED_JSON)}

I found these details from multiple sources.`

      mockCreate.mockResolvedValue(makeMockResponse(freeTextResponse))

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.status).not.toBe('failed')
      expect(result.fillRate).toBeGreaterThan(0)
    })

    it('returns failed when response contains no parseable JSON at all', async () => {
      mockCreate.mockResolvedValue(makeMockResponse('I could not find any product information.'))

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.status).toBe('failed')
    })

    it('returns failed when response content is null', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
      })

      const adapter = createGptAdapter()
      const result = await adapter.enrich(MOCK_PRODUCT)

      expect(result.status).toBe('failed')
    })
  })
})

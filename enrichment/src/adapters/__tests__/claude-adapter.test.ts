import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '../../types/product.js'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  class MockAnthropic {
    messages = { create: mockCreate }
  }
  return {
    default: MockAnthropic,
    __mockCreate: mockCreate,
  }
})

const mockOpenAICreate = vi.fn()
const openAIConfigs: Array<{ apiKey?: string; baseURL?: string }> = []

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } }

    constructor(config: { apiKey?: string; baseURL?: string }) {
      openAIConfigs.push(config)
    }
  }

  return {
    default: MockOpenAI,
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
  sku: 'SKU-001',
  code: 'CODE-001',
  gtin: ['1234567890123'],
  name: 'Leather Bag',
  brand: 'Gucci',
  color: 'Black',
  model: 'GG-100',
  price: 1200,
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
  materials_original: 'Pelle',
  department_original: 'Donna',
  unit_system_name_original: 'EU',
  year: '2023',
  collection: 'Fall Winter',
  dimensions: '',
  collection_original: 'Autunno Inverno',
  title: 'Gucci Leather Bag',
  sizes_raw: '[]',
  season_raw: 'FW23',
  description: '',
  size_system: 'EU',
  category_item: 'Handbag',
  season_display: 'Fall Winter 2023',
  sizes_original: '[]',
  vendor_product_id: 'VND-001',
}

const FULL_ENRICHMENT_RESPONSE = {
  title: 'GG Marmont Small Shoulder Bag',
  description_eng: 'A luxurious leather bag crafted in Italy.',
  season: 'Fall Winter 2023',
  year: '2023',
  collection: 'GG Collection',
  gtin: '1234567890123',
  dimensions: '30x20x10cm',
  made_in: 'Italy',
  materials: '100% Leather',
  weight: '0.8kg',
  color: 'Black',
  additional_info: 'Features GG monogram hardware',
  accuracy_score: 8,
}

const PARTIAL_ENRICHMENT_RESPONSE = {
  title: 'GG Marmont Bag',
  description_eng: 'A luxurious leather bag.',
  season: 'Fall Winter 2023',
  year: '',
  collection: '',
  gtin: '',
  dimensions: '',
  made_in: 'Italy',
  materials: '100% Leather',
  weight: '',
  color: '',
  additional_info: '',
  accuracy_score: 5,
}

function buildApiResponse(content: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(content),
      },
    ],
  }
}

describe('Claude Adapter', () => {
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockOpenAICreate.mockReset()
    openAIConfigs.length = 0
    // Reset env
    delete process.env.CLAUDE_MODEL
    delete process.env.CLAUDE_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAUDE_BASE_URL
    delete process.env.LITELLM_API_KEY
    delete process.env.LITELLM_BASE_URL

    const mod = await import('@anthropic-ai/sdk')
    mockCreate = (mod as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate
  })

  it('createClaudeAdapter returns object implementing EnrichmentAdapter with name "claude"', async () => {
    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    expect(adapter.name).toBe('claude')
    expect(typeof adapter.enrich).toBe('function')
  })

  it('enrich() calls messages.create with base64 image blocks + text content when images provided', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const images = [
      { data: Buffer.from('fake-image-data'), mimeType: 'image/jpeg' },
      { data: Buffer.from('another-image'), mimeType: 'image/png' },
    ] as const

    await adapter.enrich(SAMPLE_PRODUCT, images)

    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0][0]

    // Verify images are present as base64 blocks
    const userContent = callArgs.messages[0].content
    const imageBlocks = userContent.filter((b: { type: string }) => b.type === 'image')
    expect(imageBlocks).toHaveLength(2)
    expect(imageBlocks[0].source.type).toBe('base64')
    expect(imageBlocks[0].source.media_type).toBe('image/jpeg')
    expect(imageBlocks[0].source.data).toBe(Buffer.from('fake-image-data').toString('base64'))
    expect(imageBlocks[1].source.media_type).toBe('image/png')
  })

  it('enrich() calls messages.create with text-only content when no images provided', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = callArgs.messages[0].content
    const textBlocks = userContent.filter((b: { type: string }) => b.type === 'text')
    const imageBlocks = userContent.filter((b: { type: string }) => b.type === 'image')

    expect(textBlocks).toHaveLength(1)
    expect(imageBlocks).toHaveLength(0)
  })

  it('enrich() places image blocks before text block', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const images = [
      { data: Buffer.from('img'), mimeType: 'image/jpeg' },
    ] as const

    await adapter.enrich(SAMPLE_PRODUCT, images)

    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = callArgs.messages[0].content

    // Last block should be text
    expect(userContent[userContent.length - 1].type).toBe('text')
    // First block(s) should be images
    expect(userContent[0].type).toBe('image')
  })

  it('enrich() uses output_config with zodOutputFormat for structured output', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.output_config).toBeDefined()
    expect(callArgs.output_config.format).toBeDefined()
    // zodOutputFormat produces a json_schema format object
    expect(callArgs.output_config.format.type).toBe('json_schema')
  })

  it('enrich() returns EnrichmentResult with correct fillRate, enrichedFields, and accuracyScore on success', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('success')
    expect(result.fillRate).toBe(1.0)
    expect(result.accuracyScore).toBe(8)
    expect(result.enrichedFields).toContain('description_eng')
    expect(result.enrichedFields).toContain('made_in')
    expect(result.enrichedFields).toContain('materials')
    expect(result.enrichedFields.length).toBe(12)
    expect(result.fields.description_eng).toBe('A luxurious leather bag crafted in Italy.')
  })

  it('enrich() returns status "partial" when some fields are filled but not all', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(PARTIAL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('partial')
    expect(result.fillRate).toBeGreaterThan(0)
    expect(result.fillRate).toBeLessThan(1.0)
    expect(result.accuracyScore).toBe(5)
  })

  it('enrich() returns status "failed" with error message when API call throws', async () => {
    const { withRetry } = await import('../../batch/retry.js')
    vi.mocked(withRetry).mockRejectedValueOnce(new Error('API rate limit exceeded'))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const result = await adapter.enrich(SAMPLE_PRODUCT)

    expect(result.status).toBe('failed')
    expect(result.fillRate).toBe(0)
    expect(result.enrichedFields).toEqual([])
    expect(result.error).toBe('API rate limit exceeded')
  })

  it('enrich() wraps API call in withRetry for automatic retry with backoff', async () => {
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { withRetry } = await import('../../batch/retry.js')
    // Restore default pass-through behavior for this test
    vi.mocked(withRetry).mockImplementation(async (fn) => fn())

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    expect(withRetry).toHaveBeenCalledOnce()
    expect(vi.mocked(withRetry).mock.calls[0][1]).toContain('claude')
  })

  it('enrich() uses model from env var CLAUDE_MODEL or defaults to "claude-haiku-4-5-20250415"', async () => {
    // Test default model
    mockCreate.mockResolvedValue(buildApiResponse(FULL_ENRICHMENT_RESPONSE))

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    await adapter.enrich(SAMPLE_PRODUCT)

    let callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('claude-haiku-4-5-20250415')

    // Test env var override
    mockCreate.mockClear()
    process.env.CLAUDE_MODEL = 'claude-sonnet-4-20250514'

    const mod2 = await import('../claude-adapter.js')
    const adapter2 = mod2.createClaudeAdapter()

    await adapter2.enrich(SAMPLE_PRODUCT)

    callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.model).toBe('claude-sonnet-4-20250514')
  })

  it('routes Claude through LiteLLM when a LiteLLM base URL is configured', async () => {
    process.env.LITELLM_BASE_URL = 'https://llm.lazertechnologies.com'
    process.env.LITELLM_API_KEY = 'litellm-key'
    process.env.CLAUDE_MODEL = 'anthropic/claude-haiku-4-5-20250415'

    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(FULL_ENRICHMENT_RESPONSE),
          },
        },
      ],
    })

    const { createClaudeAdapter } = await import('../claude-adapter.js')
    const adapter = createClaudeAdapter()

    const images = [{ data: Buffer.from('img'), mimeType: 'image/jpeg' }] as const
    await adapter.enrich(SAMPLE_PRODUCT, images)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockOpenAICreate).toHaveBeenCalledOnce()
    expect(openAIConfigs[0]).toEqual({
      apiKey: 'litellm-key',
      baseURL: 'https://llm.lazertechnologies.com',
    })

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('anthropic/claude-haiku-4-5-20250415')
    expect(callArgs.response_format.type).toBe('json_schema')
    expect(callArgs.messages[0].content[0].type).toBe('image_url')
    expect(callArgs.messages[0].content[0].image_url.url).toContain('data:image/jpeg;base64,')
  })
})

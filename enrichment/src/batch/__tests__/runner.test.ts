import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../../types/product.js'
import type { EnrichmentAdapter, EnrichmentResult, ImageInput } from '../../adapters/types.js'

const {
  mockLoadCheckpoint,
  mockGetCompletedSkus,
  mockWriteCheckpoint,
  mockPrepareProductImages,
  mockWriteProductCSV,
} = vi.hoisted(() => ({
  mockLoadCheckpoint: vi.fn(),
  mockGetCompletedSkus: vi.fn(),
  mockWriteCheckpoint: vi.fn(),
  mockPrepareProductImages: vi.fn(),
  mockWriteProductCSV: vi.fn(),
}))

vi.mock('../checkpoint.js', () => ({
  loadCheckpoint: mockLoadCheckpoint,
  getCompletedSkus: mockGetCompletedSkus,
  writeCheckpoint: mockWriteCheckpoint,
}))

vi.mock('../../images/resizer.js', () => ({
  prepareProductImages: mockPrepareProductImages,
}))

vi.mock('../../parsers/csv-writer.js', () => ({
  writeProductCSV: mockWriteProductCSV,
}))

function createProduct(sku: string): Product {
  return {
    sku,
    code: `CODE-${sku}`,
    gtin: ['1234567890123'],
    name: `Product ${sku}`,
    brand: 'Brand',
    color: 'Black',
    model: 'MODEL-1',
    price: 1000,
    sizes: [],
    errors: [],
    images: [],
    season: 'FW23',
    made_in: 'Italy',
    category: 'Bags',
    feed_name: 'feed',
    department: 'Women',
    product_id: `PID-${sku}`,
    season_year: '2023',
    color_original: 'Black',
    made_in_original: 'Italy',
    category_original: 'Bags',
    materials_original: 'Leather',
    department_original: 'Women',
    unit_system_name_original: 'EU',
    year: '2023',
    collection: 'Collection',
    dimensions: '',
    collection_original: 'Collection',
    title: `Title ${sku}`,
    sizes_raw: '[]',
    season_raw: 'FW23',
    description: '',
    size_system: 'EU',
    category_item: 'Handbag',
    season_display: 'Fall/Winter 2023',
    sizes_original: '[]',
    vendor_product_id: `VENDOR-${sku}`,
  }
}

function createResult(
  partial?: Partial<EnrichmentResult>,
): EnrichmentResult {
  return {
    fields: { description_eng: 'Generated description' },
    status: 'partial',
    fillRate: 0.11,
    enrichedFields: ['description_eng'],
    ...partial,
  }
}

describe('runBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockLoadCheckpoint.mockReturnValue(undefined)
    mockGetCompletedSkus.mockReturnValue(new Set())
    mockPrepareProductImages.mockResolvedValue([])
    mockWriteCheckpoint.mockImplementation(() => {})
    mockWriteProductCSV.mockImplementation(() => {})
  })

  it('processes all products and returns results array', async () => {
    const products = [createProduct('SKU-1'), createProduct('SKU-2')]
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(createResult()),
    }

    const { runBatch, DEFAULT_CONCURRENCY } = await import('../runner.js')
    const result = await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 2,
    })

    expect(DEFAULT_CONCURRENCY).toMatchObject({
      claude: 3,
      gemini: 5,
      firecrawl: 2,
      gpt: 3,
    })
    expect(result.results).toHaveLength(2)
    expect(result.results.map((entry) => entry.sku)).toEqual(['SKU-1', 'SKU-2'])
    expect(adapter.enrich).toHaveBeenCalledTimes(2)
    expect(mockWriteProductCSV).toHaveBeenCalledOnce()
  })

  it('skips already-completed SKUs from checkpoint', async () => {
    const products = [createProduct('SKU-1'), createProduct('SKU-2')]
    mockLoadCheckpoint.mockReturnValue({
      tool: 'claude',
      startedAt: '2026-03-13T00:00:00.000Z',
      lastUpdatedAt: '2026-03-13T00:01:00.000Z',
      completed: [{ sku: 'SKU-1', status: 'success' }],
      artifacts: {
        'SKU-1': {
          row: {
            sku: 'SKU-1',
            description_eng: 'from checkpoint',
            _enrichment_status: 'success',
          },
          result: createResult({
            status: 'success',
            fillRate: 1,
            enrichedFields: ['description_eng'],
          }),
        },
      },
    })
    mockGetCompletedSkus.mockReturnValue(new Set(['SKU-1']))

    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(createResult()),
    }

    const { runBatch } = await import('../runner.js')
    const result = await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 2,
    })

    expect(adapter.enrich).toHaveBeenCalledTimes(1)
    expect(adapter.enrich).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU-2' }),
      expect.any(Array),
    )
    expect(result.results).toHaveLength(2)
    expect(result.results.map((entry) => entry.sku)).toEqual(['SKU-1', 'SKU-2'])
    expect(result.results[0]?.result.status).toBe('success')
    expect(result.results[0]?.result.fillRate).toBe(1)

    const writtenRows = mockWriteProductCSV.mock.calls[0][0] as ReadonlyArray<
      Record<string, unknown>
    >
    expect(writtenRows[0]?.description_eng).toBe('from checkpoint')
    expect(writtenRows[0]?._enrichment_status).toBe('success')
  })

  it('writes checkpoint after each product completion', async () => {
    const products = [
      createProduct('SKU-1'),
      createProduct('SKU-2'),
      createProduct('SKU-3'),
    ]
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(createResult()),
    }

    const { runBatch } = await import('../runner.js')
    await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 1,
    })

    expect(mockWriteCheckpoint).toHaveBeenCalledTimes(3)
    const firstPayload = mockWriteCheckpoint.mock.calls[0][1]
    const secondPayload = mockWriteCheckpoint.mock.calls[1][1]
    expect(firstPayload.completed).toHaveLength(1)
    expect(secondPayload.completed).toHaveLength(2)
  })

  it('loads images via prepareProductImages and passes them to adapter.enrich', async () => {
    const products = [createProduct('SKU-1')]
    const images: readonly ImageInput[] = [
      { data: Buffer.from('img'), mimeType: 'image/jpeg' },
    ]
    mockPrepareProductImages.mockResolvedValue(images)

    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(createResult()),
    }

    const { runBatch } = await import('../runner.js')
    await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 1,
    })

    expect(mockPrepareProductImages).toHaveBeenCalledWith(
      'SKU-1',
      '/tmp/manifest.json',
      '/tmp/images',
    )
    expect(adapter.enrich).toHaveBeenCalledWith(products[0], images)
  })

  it('uses p-limit for concurrent product processing', async () => {
    let active = 0
    let maxActive = 0
    const products = Array.from({ length: 6 }, (_, index) =>
      createProduct(`SKU-${index + 1}`),
    )
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockImplementation(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        return createResult()
      }),
    }

    const { runBatch } = await import('../runner.js')
    await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 2,
    })

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('writes enriched CSV rows with original data, enriched fields, and metadata', async () => {
    const products = [createProduct('SKU-1')]
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(
        createResult({
          fields: {
            description_eng: 'Luxury bag copy',
            made_in: 'Italy',
          },
          status: 'partial',
          fillRate: 0.22,
          enrichedFields: ['description_eng', 'made_in'],
          accuracyScore: 8,
        }),
      ),
    }

    const { runBatch } = await import('../runner.js')
    await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 1,
    })

    const writtenRows = mockWriteProductCSV.mock.calls[0][0]
    const row = writtenRows[0] as Record<string, unknown>
    expect(row.sku).toBe('SKU-1')
    expect(row.description_eng).toBe('Luxury bag copy')
    expect(row.made_in).toBe('Italy')
    expect(row._enrichment_tool).toBe('claude')
    expect(row._enrichment_status).toBe('partial')
    expect(row._enrichment_fill_rate).toBe(0.22)
    expect(row._enriched_fields).toBe('description_eng,made_in')
    expect(row._enrichment_accuracy_score).toBe('8')
  })

  it('handles adapter failures gracefully and continues processing', async () => {
    const products = [createProduct('SKU-1'), createProduct('SKU-2')]
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi
        .fn()
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce(createResult({ status: 'success', fillRate: 1 })),
    }

    const { runBatch } = await import('../runner.js')
    const result = await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 1,
    })

    expect(adapter.enrich).toHaveBeenCalledTimes(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.result.status).toBe('failed')
    expect(result.results[0]?.result.error).toBe('API timeout')
    expect(result.results[1]?.result.status).toBe('success')
  })

  it('logs progress for each product', async () => {
    const products = [createProduct('SKU-1'), createProduct('SKU-2')]
    const adapter: EnrichmentAdapter = {
      name: 'claude',
      enrich: vi.fn().mockResolvedValue(createResult()),
    }
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { runBatch } = await import('../runner.js')
    await runBatch({
      adapter,
      products,
      outputPath: '/tmp/output.csv',
      checkpointDir: '/tmp/checkpoints',
      manifestPath: '/tmp/manifest.json',
      imagesDir: '/tmp/images',
      concurrency: 1,
    })

    const progressLogs = consoleLogSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('→'))

    expect(progressLogs).toHaveLength(2)
    expect(progressLogs[0]).toContain('[claude] 1/2 SKU-1')
    expect(progressLogs[1]).toContain('[claude] 2/2 SKU-2')
  })
})

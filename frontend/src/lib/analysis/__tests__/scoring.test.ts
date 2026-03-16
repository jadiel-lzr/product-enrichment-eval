import { describe, expect, it } from 'vitest'
import type { Product, ToolEnrichment } from '@/types/enrichment'
import { buildWeightConfig } from '@/lib/analysis/weights'
import {
  buildAnalysisExportRows,
  buildAnalysisSummary,
  buildCompletenessMatrix,
  buildFieldWinnerRows,
  buildRankingSummary,
} from '@/lib/analysis/scoring'

function createProduct(sku: string): Product {
  return {
    sku,
    code: sku,
    gtin: [],
    name: sku,
    brand: 'Brand',
    color: 'black',
    model: '',
    price: 0,
    sizes: [],
    errors: [],
    images: [],
    season: '',
    made_in: '',
    category: 'Bags',
    feed_name: 'feed',
    department: 'Accessories',
    product_id: sku,
    season_year: '',
    color_original: '',
    made_in_original: '',
    category_original: '',
    materials_original: '',
    department_original: '',
    unit_system_name_original: '',
    year: '',
    collection: '',
    dimensions: '',
    collection_original: '',
    title: sku,
    sizes_raw: '',
    season_raw: '',
    description: '',
    size_system: '',
    category_item: '',
    season_display: '',
    sizes_original: '',
    vendor_product_id: sku,
    _has_images: false,
    _image_count: 0,
  } as Product
}

function createEnrichment(
  sku: string,
  tool: ToolEnrichment['tool'],
  overrides: Partial<ToolEnrichment> = {},
): ToolEnrichment {
  const filledFields = overrides.enrichedValues
    ? Object.keys(overrides.enrichedValues).length
    : 0

  return {
    sku,
    tool,
    status: 'success',
    scoreTrack: 'confidence',
    accuracyScore: 0.8,
    fieldsEnriched: filledFields,
    totalFields: 9,
    enrichedValues: {},
    originalValues: {},
    ...overrides,
  }
}

function createDataset() {
  const products = [createProduct('sku-1'), createProduct('sku-2'), createProduct('sku-3')]
  const filteredProducts = [products[0], products[1]]

  const enrichmentsByProduct = new Map<string, ToolEnrichment[]>([
    [
      'sku-1',
      [
        createEnrichment('sku-1', 'claude', {
          accuracyScore: 0.95,
          scoreTrack: 'confidence',
          fieldsEnriched: 9,
          enrichedValues: {
            description_eng: 'A',
            season: 'A',
            year: 'A',
            collection: 'A',
            gtin: 'A',
            dimensions: 'A',
            made_in: 'A',
            materials: 'A',
            weight: 'A',
          },
        }),
        createEnrichment('sku-1', 'gemini', {
          accuracyScore: 0.85,
          scoreTrack: 'confidence',
          fieldsEnriched: 8,
          enrichedValues: {
            description_eng: 'B',
            season: 'B',
            year: 'B',
            collection: 'B',
            gtin: 'B',
            dimensions: 'B',
            made_in: 'B',
            materials: 'B',
          },
        }),
        createEnrichment('sku-1', 'firecrawl', {
          accuracyScore: undefined,
          scoreTrack: 'no-confidence',
          fieldsEnriched: 7,
          enrichedValues: {
            description_eng: 'C',
            season: 'C',
            year: 'C',
            collection: 'C',
            gtin: 'C',
            dimensions: 'C',
            made_in: 'C',
          },
        }),
      ],
    ],
    [
      'sku-2',
      [
        createEnrichment('sku-2', 'claude', {
          accuracyScore: 0.91,
          scoreTrack: 'confidence',
          fieldsEnriched: 8,
          enrichedValues: {
            description_eng: 'A',
            season: 'A',
            year: 'A',
            collection: 'A',
            gtin: 'A',
            dimensions: 'A',
            made_in: 'A',
            materials: 'A',
          },
        }),
        createEnrichment('sku-2', 'gemini', {
          accuracyScore: 0.89,
          scoreTrack: 'confidence',
          fieldsEnriched: 9,
          enrichedValues: {
            description_eng: 'B',
            season: 'B',
            year: 'B',
            collection: 'B',
            gtin: 'B',
            dimensions: 'B',
            made_in: 'B',
            materials: 'B',
            weight: 'B',
          },
        }),
        createEnrichment('sku-2', 'firecrawl', {
          accuracyScore: undefined,
          scoreTrack: 'no-confidence',
          fieldsEnriched: 8,
          enrichedValues: {
            description_eng: 'C',
            season: 'C',
            year: 'C',
            collection: 'C',
            gtin: 'C',
            dimensions: 'C',
            materials: 'C',
            weight: 'C',
          },
        }),
      ],
    ],
    [
      'sku-3',
      [
        createEnrichment('sku-3', 'claude', {
          status: 'partial',
          error: 'timeout',
          accuracyScore: 0.9,
          scoreTrack: 'confidence',
          fieldsEnriched: 6,
          enrichedValues: {
            description_eng: 'A',
            season: 'A',
            year: 'A',
            collection: 'A',
            gtin: 'A',
            dimensions: 'A',
          },
        }),
        createEnrichment('sku-3', 'gemini', {
          status: 'failed',
          error: 'bad-response',
          accuracyScore: 0.4,
          scoreTrack: 'confidence',
          fieldsEnriched: 0,
        }),
        createEnrichment('sku-3', 'gpt', {
          status: 'partial',
          error: 'missing-confidence',
          accuracyScore: undefined,
          scoreTrack: 'no-confidence',
          fieldsEnriched: 5,
          enrichedValues: {
            description_eng: 'D',
            season: 'D',
            made_in: 'D',
            materials: 'D',
            weight: 'D',
          },
        }),
      ],
    ],
  ])

  return { products, filteredProducts, enrichmentsByProduct }
}

describe('analysis scoring', () => {
  it('orders the full dataset ranking by blended score with balanced weights', () => {
    const dataset = createDataset()

    const summary = buildRankingSummary({
      scopeLabel: 'full',
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
    })

    expect(summary.confidenceRows.map((row) => row.tool)).toEqual(['claude', 'gemini'])
  })

  it('recalculates ranking from only filtered products', () => {
    const dataset = createDataset()

    const fullSummary = buildRankingSummary({
      scopeLabel: 'full',
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
    })

    const filteredSummary = buildRankingSummary({
      scopeLabel: 'filtered',
      products: dataset.filteredProducts,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
    })

    expect(fullSummary.totalProducts).toBe(3)
    expect(filteredSummary.totalProducts).toBe(2)
    expect(filteredSummary.confidenceRows).toHaveLength(2)
    expect(filteredSummary.confidenceRows[0]?.blendedScore).not.toBe(
      fullSummary.confidenceRows[0]?.blendedScore,
    )
  })

  it('keeps tools without confidence in the output with a separate track', () => {
    const dataset = createDataset()
    const summary = buildRankingSummary({
      scopeLabel: 'full',
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
    })

    expect(summary.noConfidenceRows.map((row) => row.tool)).toEqual(['firecrawl', 'gpt'])
    expect(summary.noConfidenceRows.every((row) => row.scoreTrack === 'no-confidence')).toBe(true)
  })

  it('changes weighted results when manual overrides emphasize one field', () => {
    const dataset = createDataset()
    const baseline = buildFieldWinnerRows({
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
      meaningfulLeadThreshold: 0.03,
    })
    const weighted = buildFieldWinnerRows({
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig('accuracy-first', { weight: 4 }),
      meaningfulLeadThreshold: 0.03,
    })

    const baselineWeightField = baseline.find((row) => row.field === 'weight')
    const weightedWeightField = weighted.find((row) => row.field === 'weight')

    expect(baselineWeightField?.weightedScores.gemini).not.toBe(weightedWeightField?.weightedScores.gemini)
  })

  it('marks a field as too close to call when the lead is below threshold', () => {
    const dataset = createDataset()
    const rows = buildFieldWinnerRows({
      products: dataset.filteredProducts,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
      meaningfulLeadThreshold: 0.2,
    })

    const seasonRow = rows.find((row) => row.field === 'season')
    expect(seasonRow?.tooCloseToCall).toBe(true)
    expect(seasonRow?.winner).toBeUndefined()
  })

  it('computes per-tool completeness by field and overall fill rate', () => {
    const dataset = createDataset()
    const matrix = buildCompletenessMatrix({
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
    })

    const claude = matrix.find((row) => row.tool === 'claude')
    expect(claude?.overallFillRate).toBeGreaterThan(0.8)
    expect(claude?.fields.find((field) => field.field === 'description_eng')?.fillRate).toBe(1)
  })

  it('counts failed and partial rows without crashing aggregations', () => {
    const dataset = createDataset()
    const summary = buildRankingSummary({
      scopeLabel: 'full',
      products: dataset.products,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights: buildWeightConfig(),
    })

    const gemini = summary.confidenceRows.find((row) => row.tool === 'gemini')
    const gpt = summary.noConfidenceRows.find((row) => row.tool === 'gpt')

    expect(gemini?.failedCount).toBe(1)
    expect(gpt?.partialCount).toBe(1)
    expect(gpt?.errorCount).toBe(1)
  })

  it('builds export rows for the current analysis view', () => {
    const dataset = createDataset()
    const weights = buildWeightConfig('completeness-first', { materials: 2.5 })
    const summary = buildAnalysisSummary({
      products: dataset.products,
      filteredProducts: dataset.filteredProducts,
      enrichmentsByProduct: dataset.enrichmentsByProduct,
      weights,
      meaningfulLeadThreshold: 0.05,
    })

    const rows = buildAnalysisExportRows(summary)

    expect(rows.some((row) => row.section === 'ranking' && row.scope === 'filtered')).toBe(true)
    expect(rows.some((row) => row.section === 'field-winner' && row.field === 'materials')).toBe(true)
    expect(rows.some((row) => row.section === 'weights' && row.metric === 'presetId' && row.value === 'completeness-first')).toBe(true)
  })
})

import {
  CORE_ENRICHMENT_FIELDS,
  TOOL_NAMES,
  type CoreEnrichmentField,
  type ToolEnrichment,
  type ToolName,
} from '@/types/enrichment'
import type {
  AnalysisExportRow,
  AnalysisInput,
  AnalysisRankingRow,
  AnalysisRankingSummary,
  AnalysisSummary,
  AnalysisWeightConfig,
  CompletenessFieldRow,
  CompletenessMatrixRow,
  ExecutiveTakeaway,
  FieldWinnerRow,
  FieldWeightMap,
} from '@/lib/analysis/types'

interface RankingSummaryInput {
  readonly scopeLabel: string
  readonly products: readonly { sku: string }[]
  readonly enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>
  readonly weights: AnalysisWeightConfig
}

interface FieldWinnerInput {
  readonly products: readonly { sku: string }[]
  readonly enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>
  readonly weights: AnalysisWeightConfig
  readonly meaningfulLeadThreshold: number
}

interface CompletenessInput {
  readonly products: readonly { sku: string }[]
  readonly enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>
}

interface AnalysisSummaryInput extends AnalysisInput {
  readonly weights: AnalysisWeightConfig
  readonly meaningfulLeadThreshold: number
}

interface ToolAccumulator {
  readonly tool: ToolName
  readonly rows: ToolEnrichment[]
  readonly filledCounts: Record<CoreEnrichmentField, number>
  successCount: number
  partialCount: number
  failedCount: number
  errorCount: number
  weightedFillSum: number
  weightedScoreSum: number
  overallFilledCount: number
  confidenceScoreSum: number
  confidenceScoreCount: number
}

const DEFAULT_MEANINGFUL_LEAD_THRESHOLD = 0.05

function createFieldCountMap(): Record<CoreEnrichmentField, number> {
  return Object.fromEntries(
    CORE_ENRICHMENT_FIELDS.map((field) => [field, 0]),
  ) as Record<CoreEnrichmentField, number>
}

function getWeightTotal(weights: FieldWeightMap): number {
  return CORE_ENRICHMENT_FIELDS.reduce((sum, field) => sum + weights[field], 0)
}

function round(value: number): number {
  return Number(value.toFixed(4))
}

function isFieldFilled(enrichment: ToolEnrichment, field: CoreEnrichmentField): boolean {
  const value = enrichment.enrichedValues[field] ?? ''
  return value.trim().length > 0
}

function createAccumulator(tool: ToolName): ToolAccumulator {
  return {
    tool,
    rows: [],
    filledCounts: createFieldCountMap(),
    successCount: 0,
    partialCount: 0,
    failedCount: 0,
    errorCount: 0,
    weightedFillSum: 0,
    weightedScoreSum: 0,
    overallFilledCount: 0,
    confidenceScoreSum: 0,
    confidenceScoreCount: 0,
  }
}

function collectToolStats(
  products: readonly { sku: string }[],
  enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>,
  weights: FieldWeightMap,
): Map<ToolName, ToolAccumulator> {
  const accumulators = new Map<ToolName, ToolAccumulator>(
    TOOL_NAMES.map((tool) => [tool, createAccumulator(tool)]),
  )
  const weightTotal = getWeightTotal(weights)

  for (const product of products) {
    const enrichments = enrichmentsByProduct.get(product.sku) ?? []
    for (const enrichment of enrichments) {
      const accumulator = accumulators.get(enrichment.tool)
      if (!accumulator) {
        continue
      }

      accumulator.rows.push(enrichment)

      if (enrichment.status === 'success') accumulator.successCount++
      if (enrichment.status === 'partial') accumulator.partialCount++
      if (enrichment.status === 'failed') accumulator.failedCount++
      if (enrichment.error) accumulator.errorCount++

      let rowWeightedFill = 0

      for (const field of CORE_ENRICHMENT_FIELDS) {
        if (isFieldFilled(enrichment, field)) {
          accumulator.filledCounts[field] += 1
          accumulator.overallFilledCount += 1
          rowWeightedFill += weights[field]
        }
      }

      const rowFillRate = weightTotal === 0 ? 0 : rowWeightedFill / weightTotal
      accumulator.weightedFillSum += rowFillRate

      if (typeof enrichment.accuracyScore === 'number' && enrichment.scoreTrack === 'confidence') {
        accumulator.confidenceScoreSum += enrichment.accuracyScore
        accumulator.confidenceScoreCount += 1
        const normalizedScore = enrichment.accuracyScore / 10
        accumulator.weightedScoreSum += normalizedScore * rowFillRate
      } else {
        accumulator.weightedScoreSum += rowFillRate
      }
    }
  }

  return accumulators
}

function buildRankingRow(
  accumulator: ToolAccumulator,
  productCount: number,
): AnalysisRankingRow | undefined {
  const rowCount = accumulator.rows.length
  if (rowCount === 0 || productCount === 0) {
    return undefined
  }

  const scoreTrack =
    accumulator.confidenceScoreCount === rowCount ? 'confidence' : 'no-confidence'
  const completenessScore = accumulator.overallFilledCount / (rowCount * CORE_ENRICHMENT_FIELDS.length)
  const weightedQualityScore =
    scoreTrack === 'confidence'
      ? accumulator.weightedScoreSum / rowCount
      : accumulator.weightedFillSum / rowCount
  const blendedScore =
    scoreTrack === 'confidence'
      ? weightedQualityScore * 0.7 + completenessScore * 0.3
      : weightedQualityScore * 0.85 + completenessScore * 0.15
  const averageFieldsEnriched = accumulator.overallFilledCount / rowCount
  const averageAccuracyScore =
    accumulator.confidenceScoreCount > 0
      ? accumulator.confidenceScoreSum / accumulator.confidenceScoreCount
      : undefined

  return {
    tool: accumulator.tool,
    productCount,
    successCount: accumulator.successCount,
    partialCount: accumulator.partialCount,
    failedCount: accumulator.failedCount,
    errorCount: accumulator.errorCount,
    weightedQualityScore: round(weightedQualityScore),
    completenessScore: round(completenessScore),
    blendedScore: round(blendedScore),
    averageFieldsEnriched: round(averageFieldsEnriched),
    overallFillRate: round(completenessScore),
    scoreTrack,
    confidenceMetrics:
      scoreTrack === 'confidence'
        ? {
            scoreTrack,
            sampleSize: accumulator.confidenceScoreCount,
            averageAccuracyScore: averageAccuracyScore ? round(averageAccuracyScore) : undefined,
          }
        : undefined,
    noConfidenceMetrics:
      scoreTrack === 'no-confidence'
        ? {
            scoreTrack,
            sampleSize: rowCount,
          }
        : undefined,
  }
}

function compareRankingRows(a: AnalysisRankingRow, b: AnalysisRankingRow): number {
  if (b.blendedScore !== a.blendedScore) {
    return b.blendedScore - a.blendedScore
  }
  if (b.completenessScore !== a.completenessScore) {
    return b.completenessScore - a.completenessScore
  }
  return a.tool.localeCompare(b.tool)
}

function getCoverageRatio(
  tool: ToolName,
  field: CoreEnrichmentField,
  products: readonly { sku: string }[],
  enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>,
): number {
  if (products.length === 0) return 0

  let filledCount = 0
  for (const product of products) {
    const enrichment = (enrichmentsByProduct.get(product.sku) ?? []).find(
      (row) => row.tool === tool,
    )
    if (enrichment && isFieldFilled(enrichment, field)) {
      filledCount += 1
    }
  }

  return filledCount / products.length
}

function buildTakeaways(
  fullDataset: AnalysisRankingSummary,
  filteredSlice: AnalysisRankingSummary,
  fieldWinners: readonly FieldWinnerRow[],
): ExecutiveTakeaway[] {
  const takeaways: ExecutiveTakeaway[] = []

  if (fullDataset.topConfidenceTool) {
    takeaways.push({
      title: 'Confidence-backed leader',
      detail: `${fullDataset.topConfidenceTool} leads the full-dataset confidence track.`,
      emphasis: 'positive',
    })
  }

  if (fullDataset.topNoConfidenceTool) {
    takeaways.push({
      title: 'No-confidence track leader',
      detail: `${fullDataset.topNoConfidenceTool} stays visible without fabricated confidence scores.`,
      emphasis: 'warning',
    })
  }

  const closeCalls = fieldWinners.filter((row) => row.tooCloseToCall).length
  takeaways.push({
    title: 'Field-level confidence',
    detail:
      closeCalls > 0
        ? `${closeCalls} fields are too close to call in the current weighted view.`
        : 'Every field has a meaningful lead in the current weighted view.',
    emphasis: closeCalls > 0 ? 'neutral' : 'positive',
  })

  if (filteredSlice.topConfidenceTool && filteredSlice.topConfidenceTool !== fullDataset.topConfidenceTool) {
    takeaways.push({
      title: 'Filtered slice changed the leader',
      detail: `${filteredSlice.topConfidenceTool} leads the current filtered view.`,
      emphasis: 'neutral',
    })
  }

  return takeaways
}

export function buildRankingSummary({
  scopeLabel,
  products,
  enrichmentsByProduct,
  weights,
}: RankingSummaryInput): AnalysisRankingSummary {
  const accumulators = collectToolStats(products, enrichmentsByProduct, weights.effectiveWeights)
  const rows = [...accumulators.values()]
    .map((accumulator) => buildRankingRow(accumulator, products.length))
    .filter((row): row is AnalysisRankingRow => row !== undefined)
    .sort(compareRankingRows)

  const confidenceRows = rows.filter((row) => row.scoreTrack === 'confidence')
  const noConfidenceRows = rows.filter((row) => row.scoreTrack === 'no-confidence')

  return {
    scopeLabel,
    totalProducts: products.length,
    rows,
    confidenceRows,
    noConfidenceRows,
    topConfidenceTool: confidenceRows[0]?.tool,
    topNoConfidenceTool: noConfidenceRows[0]?.tool,
  }
}

export function buildFieldWinnerRows({
  products,
  enrichmentsByProduct,
  weights,
  meaningfulLeadThreshold = DEFAULT_MEANINGFUL_LEAD_THRESHOLD,
}: FieldWinnerInput): FieldWinnerRow[] {
  return CORE_ENRICHMENT_FIELDS.map((field) => {
    const weightedScores = Object.fromEntries(
      TOOL_NAMES.map((tool) => [
        tool,
        round(getCoverageRatio(tool, field, products, enrichmentsByProduct) * weights.effectiveWeights[field]),
      ]),
    ) as Record<ToolName, number>

    const sorted = [...TOOL_NAMES]
      .map((tool) => ({ tool, score: weightedScores[tool] }))
      .sort((a, b) => b.score - a.score || a.tool.localeCompare(b.tool))

    const topScore = sorted[0]?.score ?? 0
    const nextScore = sorted[1]?.score ?? 0
    const margin = round(topScore - nextScore)
    const tooCloseToCall = margin < meaningfulLeadThreshold || topScore === 0

    return {
      field,
      winner: tooCloseToCall ? undefined : sorted[0]?.tool,
      margin,
      tooCloseToCall,
      weightedScores,
    }
  })
}

export function buildCompletenessMatrix({
  products,
  enrichmentsByProduct,
}: CompletenessInput): CompletenessMatrixRow[] {
  const totalProducts = products.length

  return TOOL_NAMES.map((tool) => {
    const fields: CompletenessFieldRow[] = CORE_ENRICHMENT_FIELDS.map((field) => {
      let filledCount = 0
      for (const product of products) {
        const enrichment = (enrichmentsByProduct.get(product.sku) ?? []).find(
          (row) => row.tool === tool,
        )
        if (enrichment && isFieldFilled(enrichment, field)) {
          filledCount += 1
        }
      }

      return {
        field,
        filledCount,
        totalCount: totalProducts,
        fillRate: totalProducts === 0 ? 0 : round(filledCount / totalProducts),
      }
    })

    const overallFilledCount = fields.reduce((sum, field) => sum + field.filledCount, 0)
    const overallTotalCount = totalProducts * CORE_ENRICHMENT_FIELDS.length

    return {
      tool,
      overallFilledCount,
      overallTotalCount,
      overallFillRate:
        overallTotalCount === 0 ? 0 : round(overallFilledCount / overallTotalCount),
      fields,
    }
  })
}

export function buildAnalysisSummary({
  products,
  filteredProducts,
  enrichmentsByProduct,
  weights,
  meaningfulLeadThreshold = DEFAULT_MEANINGFUL_LEAD_THRESHOLD,
}: AnalysisSummaryInput): AnalysisSummary {
  const fullDataset = buildRankingSummary({
    scopeLabel: 'full',
    products,
    enrichmentsByProduct,
    weights,
  })

  const filteredSlice = buildRankingSummary({
    scopeLabel: 'filtered',
    products: filteredProducts,
    enrichmentsByProduct,
    weights,
  })

  const fieldWinners = buildFieldWinnerRows({
    products: filteredProducts,
    enrichmentsByProduct,
    weights,
    meaningfulLeadThreshold,
  })

  const completeness = buildCompletenessMatrix({
    products: filteredProducts,
    enrichmentsByProduct,
  })

  return {
    fullDataset,
    filteredSlice,
    fieldWinners,
    completeness,
    takeaways: buildTakeaways(fullDataset, filteredSlice, fieldWinners),
    weights,
  }
}

export function buildAnalysisExportRows(summary: AnalysisSummary): AnalysisExportRow[] {
  const rows: AnalysisExportRow[] = []

  for (const ranking of [summary.fullDataset, summary.filteredSlice]) {
    for (const row of ranking.rows) {
      rows.push({
        scope: ranking.scopeLabel,
        section: 'ranking',
        tool: row.tool,
        metric: 'blendedScore',
        value: row.blendedScore,
      })
      rows.push({
        scope: ranking.scopeLabel,
        section: 'ranking',
        tool: row.tool,
        metric: 'scoreTrack',
        value: row.scoreTrack,
      })
    }
  }

  for (const row of summary.fieldWinners) {
    rows.push({
      scope: summary.filteredSlice.scopeLabel,
      section: 'field-winner',
      field: row.field,
      tool: row.winner,
      metric: 'tooCloseToCall',
      value: row.tooCloseToCall,
    })
    rows.push({
      scope: summary.filteredSlice.scopeLabel,
      section: 'field-winner',
      field: row.field,
      tool: row.winner,
      metric: 'winner',
      value: row.winner ?? 'too-close-to-call',
    })
    rows.push({
      scope: summary.filteredSlice.scopeLabel,
      section: 'field-winner',
      field: row.field,
      metric: 'margin',
      value: row.margin,
    })
  }

  for (const row of summary.completeness) {
    rows.push({
      scope: summary.filteredSlice.scopeLabel,
      section: 'completeness',
      tool: row.tool,
      metric: 'overallFillRate',
      value: row.overallFillRate,
    })

    for (const field of row.fields) {
      rows.push({
        scope: summary.filteredSlice.scopeLabel,
        section: 'completeness',
        tool: row.tool,
        field: field.field,
        metric: 'fieldFillRate',
        value: field.fillRate,
      })
    }
  }

  rows.push({
    scope: 'weights',
    section: 'weights',
    metric: 'presetId',
    value: summary.weights.presetId,
  })

  for (const field of CORE_ENRICHMENT_FIELDS) {
    rows.push({
      scope: 'weights',
      section: 'weights',
      field,
      metric: 'effectiveWeight',
      value: summary.weights.effectiveWeights[field],
    })
  }

  return rows
}

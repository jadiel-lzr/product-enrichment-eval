import type {
  CoreEnrichmentField,
  ScoreTrack,
  ToolEnrichment,
  ToolName,
} from '@/types/enrichment'

export type WeightPresetId = 'balanced' | 'accuracy-first' | 'completeness-first'

export type FieldWeightMap = Readonly<Record<CoreEnrichmentField, number>>

export interface WeightPreset {
  readonly id: WeightPresetId
  readonly label: string
  readonly description: string
  readonly weights: FieldWeightMap
}

export interface AnalysisWeightConfig {
  readonly presetId: WeightPresetId
  readonly presetWeights: FieldWeightMap
  readonly manualOverrides: Partial<Record<CoreEnrichmentField, number>>
  readonly effectiveWeights: FieldWeightMap
}

export interface RankingMetricTrack {
  readonly scoreTrack: ScoreTrack
  readonly sampleSize: number
  readonly averageAccuracyScore?: number
}

export interface AnalysisRankingRow {
  readonly tool: ToolName
  readonly productCount: number
  readonly successCount: number
  readonly partialCount: number
  readonly failedCount: number
  readonly errorCount: number
  readonly weightedQualityScore: number
  readonly completenessScore: number
  readonly blendedScore: number
  readonly averageFieldsEnriched: number
  readonly overallFillRate: number
  readonly scoreTrack: ScoreTrack
  readonly confidenceMetrics?: RankingMetricTrack
  readonly noConfidenceMetrics?: RankingMetricTrack
}

export interface AnalysisRankingSummary {
  readonly scopeLabel: string
  readonly totalProducts: number
  readonly rows: readonly AnalysisRankingRow[]
  readonly confidenceRows: readonly AnalysisRankingRow[]
  readonly noConfidenceRows: readonly AnalysisRankingRow[]
  readonly topConfidenceTool?: ToolName
  readonly topNoConfidenceTool?: ToolName
}

export interface FieldWinnerRow {
  readonly field: CoreEnrichmentField
  readonly winner?: ToolName
  readonly margin: number
  readonly tooCloseToCall: boolean
  readonly weightedScores: Readonly<Record<ToolName, number>>
}

export interface CompletenessFieldRow {
  readonly field: CoreEnrichmentField
  readonly filledCount: number
  readonly totalCount: number
  readonly fillRate: number
}

export interface CompletenessMatrixRow {
  readonly tool: ToolName
  readonly overallFilledCount: number
  readonly overallTotalCount: number
  readonly overallFillRate: number
  readonly fields: readonly CompletenessFieldRow[]
}

export interface ExecutiveTakeaway {
  readonly title: string
  readonly detail: string
  readonly emphasis: 'positive' | 'neutral' | 'warning'
}

export interface AnalysisExportRow {
  readonly scope: string
  readonly section: 'ranking' | 'field-winner' | 'completeness' | 'weights'
  readonly tool?: ToolName
  readonly field?: CoreEnrichmentField
  readonly metric: string
  readonly value: string | number | boolean
}

export interface AnalysisSummary {
  readonly fullDataset: AnalysisRankingSummary
  readonly filteredSlice: AnalysisRankingSummary
  readonly fieldWinners: readonly FieldWinnerRow[]
  readonly completeness: readonly CompletenessMatrixRow[]
  readonly takeaways: readonly ExecutiveTakeaway[]
  readonly weights: AnalysisWeightConfig
}

export interface AnalysisInput {
  readonly products: readonly { sku: string }[]
  readonly filteredProducts: readonly { sku: string }[]
  readonly enrichmentsByProduct: ReadonlyMap<string, readonly ToolEnrichment[]>
}

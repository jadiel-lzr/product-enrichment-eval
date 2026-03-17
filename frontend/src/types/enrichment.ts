// Re-export shared types from enrichment package
export type { Product, EnrichedFields } from '@shared/index'
export { ENRICHMENT_TARGET_FIELDS } from '@shared/index'

// Tool identifiers
export type ToolName = 'claude' | 'gemini' | 'firecrawl' | 'gpt'

export const TOOL_NAMES: readonly ToolName[] = [
  'claude',
  'gemini',
  'firecrawl',
  'gpt',
] as const

export const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  firecrawl: 'FireCrawl',
  gpt: 'GPT',
}

// Core enrichment target fields (matches ENRICHMENT_TARGET_FIELDS from shared schema)
export const CORE_ENRICHMENT_FIELDS = [
  'title',
  'description_eng',
  'season',
  'year',
  'collection',
  'gtin',
  'dimensions',
  'made_in',
  'materials',
  'weight',
  'color',
  'additional_info',
] as const

export type CoreEnrichmentField = (typeof CORE_ENRICHMENT_FIELDS)[number]

export type ScoreTrack = 'confidence' | 'no-confidence'

// Field display labels
export const FIELD_LABELS: Record<CoreEnrichmentField, string> = {
  title: 'Title',
  description_eng: 'Description (EN)',
  season: 'Season',
  year: 'Year',
  collection: 'Collection',
  gtin: 'GTIN',
  dimensions: 'Dimensions',
  made_in: 'Made In',
  materials: 'Materials',
  weight: 'Weight',
  color: 'Color',
  additional_info: 'Additional Info',
}

// Enrichment status for a single product from a single tool
export interface ToolEnrichment {
  readonly sku: string
  readonly tool: ToolName
  readonly status: 'success' | 'partial' | 'failed'
  readonly error?: string
  readonly accuracyScore?: number
  readonly scoreTrack: ScoreTrack
  readonly fieldsEnriched: number
  readonly totalFields: number
  readonly enrichedValues: Readonly<Record<string, string>>
  readonly originalValues: Readonly<Record<string, string>>
  readonly imageLinks?: readonly string[]
  readonly sourceUrl?: string
}

// Field diff status for color coding
export type FieldStatus = 'enriched' | 'unchanged' | 'missing'

// Filter state
export interface FilterState {
  readonly search: string
  readonly brand: string
  readonly category: string
  readonly department: string
  readonly enrichedBy: string
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  brand: '',
  category: '',
  department: '',
  enrichedBy: '',
}

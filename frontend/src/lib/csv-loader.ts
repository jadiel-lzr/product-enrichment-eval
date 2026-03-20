import Papa from 'papaparse'
import { ProductSchema } from '@shared/index'
import type { Product } from '@/types/enrichment'
import {
  CORE_ENRICHMENT_FIELDS,
  TOOL_NAMES,
  type ScoreTrack,
  type ToolEnrichment,
  type ToolName,
} from '@/types/enrichment'
import type { DatasetConfig } from '@/types/dataset'

const JSON_COLUMNS = ['images', 'gtin', 'sizes', 'errors'] as const

function parseJsonField(value: string): unknown {
  if (!value || value.trim() === '') return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function parseRow(raw: Record<string, string>): Record<string, unknown> {
  const transformed: Record<string, unknown> = { ...raw }
  for (const col of JSON_COLUMNS) {
    if (typeof transformed[col] === 'string') {
      transformed[col] = parseJsonField(transformed[col] as string)
    }
  }
  return transformed
}

async function loadCSV(path: string): Promise<Record<string, string>[]> {
  const response = await fetch(path)
  if (!response.ok) {
    if (response.status === 404) return []
    throw new Error(`Failed to fetch ${path}: ${response.status}`)
  }

  const text = await response.text()

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => resolve(results.data),
      error: (error: Error) => reject(error),
    })
  })
}

export async function loadProductCSV(config: DatasetConfig): Promise<Product[]> {
  const rows = await loadCSV(config.baseCsvPath)
  const products: Product[] = []

  for (const raw of rows) {
    try {
      const normalized = config.normalizeRow ? config.normalizeRow(raw) : raw
      const transformed = parseRow(normalized)
      const product = ProductSchema.parse(transformed)
      products.push(product)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Failed to parse product row:', message)
    }
  }

  return products
}

function deriveEnrichmentStatus(
  row: Record<string, string>,
): 'success' | 'partial' | 'failed' {
  const rawStatus = row['_enrichment_status']
  if (rawStatus === 'success' || rawStatus === 'partial' || rawStatus === 'failed') {
    return rawStatus
  }
  return 'failed'
}

function parseAccuracyScore(row: Record<string, string>): number | undefined {
  const rawScore =
    row['_accuracy_score']?.trim() ||
    row['_enrichment_accuracy_score']?.trim() ||
    ''

  if (!rawScore) {
    return undefined
  }

  const accuracyScore = Number(rawScore)
  if (!Number.isFinite(accuracyScore)) {
    return undefined
  }

  return accuracyScore
}

function deriveScoreTrack(accuracyScore: number | undefined): ScoreTrack {
  return typeof accuracyScore === 'number' ? 'confidence' : 'no-confidence'
}

function buildToolEnrichment(
  row: Record<string, string>,
  tool: ToolName,
): ToolEnrichment {
  const sku = row['sku'] ?? ''
  const status = deriveEnrichmentStatus(row)
  const error = row['_enrichment_error'] || undefined
  const accuracyScore = parseAccuracyScore(row)

  const enrichedValues: Record<string, string> = {}
  const originalValues: Record<string, string> = {}
  let fieldsEnriched = 0

  for (const field of CORE_ENRICHMENT_FIELDS) {
    const value = row[field] ?? ''
    originalValues[field] = value

    if (value.trim() !== '') {
      enrichedValues[field] = value
      fieldsEnriched++
    }
  }

  const rawImageLinks = row['image_links']?.trim() ?? ''
  const imageLinks = rawImageLinks
    ? rawImageLinks.split('|').map((url) => url.trim()).filter(Boolean)
    : undefined
  const sourceUrl = row['source_url']?.trim() || undefined
  const confidenceScore = row['confidence_score']?.trim() || undefined
  const matchReason = row['match_reason']?.trim() || undefined

  const rawImageConfidence = row['image_confidence']?.trim() || ''
  const parsedConfidence = Number(rawImageConfidence)
  const imageConfidence = Number.isFinite(parsedConfidence) ? parsedConfidence : undefined

  const rawImageFlags = row['image_flags']?.trim() ?? ''
  let imageFlags: { url: string; reason: string }[] | undefined
  if (rawImageFlags) {
    try {
      const parsed = JSON.parse(rawImageFlags)
      if (Array.isArray(parsed)) {
        imageFlags = parsed.filter(
          (f: unknown): f is { url: string; reason: string } =>
            typeof f === 'object' && f !== null &&
            typeof (f as Record<string, unknown>).url === 'string' &&
            typeof (f as Record<string, unknown>).reason === 'string',
        )
      }
    } catch {
      // Malformed JSON — ignore
    }
  }

  return {
    sku,
    tool,
    status,
    error,
    accuracyScore,
    scoreTrack: deriveScoreTrack(accuracyScore),
    fieldsEnriched,
    totalFields: CORE_ENRICHMENT_FIELDS.length,
    enrichedValues,
    originalValues,
    imageLinks: imageLinks && imageLinks.length > 0 ? imageLinks : undefined,
    imageFlags: imageFlags && imageFlags.length > 0 ? imageFlags : undefined,
    sourceUrl,
    confidenceScore: confidenceScore && confidenceScore !== 'none' ? confidenceScore : undefined,
    matchReason: matchReason || undefined,
    imageConfidence,
  }
}

export async function loadEnrichedCSV(
  tool: ToolName,
  prefix: string = 'enriched',
  normalizeEnrichedRow?: (raw: Record<string, string>) => Record<string, string>,
): Promise<ToolEnrichment[]> {
  const rows = await loadCSV(`/data/${prefix}-${tool}.csv`)
  if (rows.length === 0) return []

  return rows.map((row) => {
    const normalized = normalizeEnrichedRow ? normalizeEnrichedRow(row) : row
    return buildToolEnrichment(normalized, tool)
  })
}

export interface LoadedData {
  readonly products: Product[]
  readonly enrichments: Map<string, ToolEnrichment[]>
}

export async function loadAllData(config: DatasetConfig): Promise<LoadedData> {
  const [productsResult, ...enrichmentResults] = await Promise.allSettled([
    loadProductCSV(config),
    ...TOOL_NAMES.map((tool) =>
      loadEnrichedCSV(tool, config.enrichedCsvPrefix, config.normalizeEnrichedRow),
    ),
  ])

  const products =
    productsResult.status === 'fulfilled' ? productsResult.value : []

  if (productsResult.status === 'rejected') {
    console.error('Failed to load products:', productsResult.reason)
  }

  const enrichments = new Map<string, ToolEnrichment[]>()

  for (let i = 0; i < TOOL_NAMES.length; i++) {
    const result = enrichmentResults[i]
    if (result.status === 'fulfilled' && result.value.length > 0) {
      for (const enrichment of result.value) {
        const existing = enrichments.get(enrichment.sku) ?? []
        enrichments.set(enrichment.sku, [...existing, enrichment])
      }
    } else if (result.status === 'rejected') {
      console.error(
        `Failed to load enriched CSV for ${TOOL_NAMES[i]}:`,
        result.reason,
      )
    }
  }

  return { products, enrichments }
}

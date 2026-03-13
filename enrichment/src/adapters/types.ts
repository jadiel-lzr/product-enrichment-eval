import type { Product } from '../types/product.js'
import { ENRICHMENT_TARGET_FIELDS, type EnrichedFields } from '../types/enriched.js'

export interface ImageInput {
  readonly data: Buffer
  readonly mimeType: string
}

export interface EnrichmentResult {
  readonly fields: EnrichedFields
  readonly status: 'success' | 'partial' | 'failed'
  readonly fillRate: number
  readonly enrichedFields: readonly string[]
  readonly accuracyScore?: number
  readonly error?: string
}

export interface EnrichmentAdapter {
  readonly name: string
  enrich(
    product: Product,
    images?: readonly ImageInput[],
  ): Promise<EnrichmentResult>
}

export interface EnrichmentMetadata {
  readonly _enrichment_tool: string
  readonly _enrichment_status: string
  readonly _enrichment_fill_rate: number
  readonly _enriched_fields: string
  readonly _enrichment_error: string
  readonly _enrichment_accuracy_score: string
}

export function computeFillRate(fields: EnrichedFields): number {
  const filled = ENRICHMENT_TARGET_FIELDS.filter((field) => {
    const value = fields[field]
    return value !== undefined && value !== ''
  })
  const rate = filled.length / ENRICHMENT_TARGET_FIELDS.length
  return Math.round(rate * 100) / 100
}

export function buildEnrichmentMetadata(
  toolName: string,
  result: EnrichmentResult,
): EnrichmentMetadata {
  return {
    _enrichment_tool: toolName,
    _enrichment_status: result.status,
    _enrichment_fill_rate: result.fillRate,
    _enriched_fields: result.enrichedFields.join(','),
    _enrichment_error: result.error ?? '',
    _enrichment_accuracy_score:
      result.accuracyScore !== undefined ? String(result.accuracyScore) : '',
  }
}

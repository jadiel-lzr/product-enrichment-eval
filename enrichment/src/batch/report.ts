import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  ENRICHMENT_TARGET_FIELDS,
  type EnrichedFields,
} from '../types/enriched.js'
import type { EnrichmentResult } from '../adapters/types.js'

export interface RunResult {
  readonly sku: string
  readonly result: EnrichmentResult
}

export interface RunReport {
  readonly tool: string
  readonly totalProducts: number
  readonly success: number
  readonly partial: number
  readonly failed: number
  readonly averageFillRate: number
  readonly fieldFillRates: Record<string, number>
  readonly duration: string
  readonly errors: ReadonlyArray<{ sku: string; error: string }>
}

export function generateRunReport(
  tool: string,
  results: ReadonlyArray<RunResult>,
  durationMs: number,
): RunReport {
  const totalProducts = results.length
  const success = results.filter((entry) => entry.result.status === 'success').length
  const partial = results.filter((entry) => entry.result.status === 'partial').length
  const failed = results.filter((entry) => entry.result.status === 'failed').length
  const averageFillRate =
    totalProducts === 0
      ? 0
      : roundToTwoDecimals(
          results.reduce((sum, entry) => sum + entry.result.fillRate, 0) /
            totalProducts,
        )

  const fieldFillRates = Object.fromEntries(
    ENRICHMENT_TARGET_FIELDS.map((field) => [
      field,
      computeFieldFillRate(
        results.map((entry) => entry.result.fields),
        field,
        totalProducts,
      ),
    ]),
  )

  const errors = results.flatMap((entry) =>
    entry.result.error
      ? [{ sku: entry.sku, error: entry.result.error }]
      : [],
  )

  return {
    tool,
    totalProducts,
    success,
    partial,
    failed,
    averageFillRate,
    fieldFillRates,
    duration: formatDuration(durationMs),
    errors,
  }
}

export function writeRunReport(report: RunReport, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8')
}

function computeFieldFillRate(
  fieldsList: ReadonlyArray<EnrichedFields>,
  field: (typeof ENRICHMENT_TARGET_FIELDS)[number],
  totalProducts: number,
): number {
  if (totalProducts === 0) {
    return 0
  }

  const filledCount = fieldsList.filter((fields) => {
    const value = fields[field]
    return value !== undefined && value !== ''
  }).length

  return roundToTwoDecimals(filledCount / totalProducts)
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${totalSeconds}s`
  }

  return `${minutes}m ${seconds}s`
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

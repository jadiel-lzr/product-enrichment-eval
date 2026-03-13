import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface CleaningReport {
  readonly totalInput: number
  readonly totalOutput: number
  readonly removed: ReadonlyArray<{ readonly sku: string; readonly reason: string }>
  readonly normalizationsApplied: {
    readonly colors: number
    readonly titles: number
  }
}

interface ReportInput {
  readonly totalInput: number
  readonly totalOutput: number
  readonly removed: ReadonlyArray<{ readonly sku: string; readonly reason: string }>
  readonly colorsNormalized: number
  readonly titlesTrimmed: number
}

export function generateCleaningReport(input: ReportInput): CleaningReport {
  return {
    totalInput: input.totalInput,
    totalOutput: input.totalOutput,
    removed: [...input.removed],
    normalizationsApplied: {
      colors: input.colorsNormalized,
      titles: input.titlesTrimmed,
    },
  }
}

export function writeCleaningReport(
  report: CleaningReport,
  filePath: string,
): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
}

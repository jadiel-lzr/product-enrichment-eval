import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { EnrichmentResult } from '../../adapters/types.js'
import { generateRunReport, writeRunReport } from '../report.js'

function createResult(
  partial?: Partial<EnrichmentResult>,
): EnrichmentResult {
  return {
    fields: {},
    status: 'failed',
    fillRate: 0,
    enrichedFields: [],
    ...partial,
  }
}

describe('report', () => {
  it('generateRunReport returns total, success, partial, and failed counts', () => {
    const report = generateRunReport(
      'claude',
      [
        { sku: 'SKU-1', result: createResult({ status: 'success', fillRate: 1 }) },
        { sku: 'SKU-2', result: createResult({ status: 'partial', fillRate: 0.5 }) },
        { sku: 'SKU-3', result: createResult({ status: 'failed', error: 'timeout' }) },
      ],
      5000,
    )

    expect(report.tool).toBe('claude')
    expect(report.totalProducts).toBe(3)
    expect(report.success).toBe(1)
    expect(report.partial).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.averageFillRate).toBe(0.5)
    expect(report.errors).toEqual([{ sku: 'SKU-3', error: 'timeout' }])
  })

  it('generateRunReport includes per-field fill rates for target fields', () => {
    const report = generateRunReport(
      'gemini',
      [
        {
          sku: 'SKU-1',
          result: createResult({
            status: 'partial',
            fillRate: 0.33,
            fields: { description_eng: 'copy', season: 'FW23', made_in: 'Italy' },
          }),
        },
        {
          sku: 'SKU-2',
          result: createResult({
            status: 'partial',
            fillRate: 0.22,
            fields: { description_eng: 'copy 2', weight: '1kg' },
          }),
        },
      ],
      1000,
    )

    expect(report.fieldFillRates.description_eng).toBe(1)
    expect(report.fieldFillRates.season).toBe(0.5)
    expect(report.fieldFillRates.made_in).toBe(0.5)
    expect(report.fieldFillRates.weight).toBe(0.5)
    expect(report.fieldFillRates.collection).toBe(0)
    expect(Object.keys(report.fieldFillRates)).toHaveLength(12)
  })

  it('writeRunReport writes report JSON to disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'run-report-test-'))
    const outputPath = join(tempDir, 'reports', 'run-report-claude.json')
    const report = generateRunReport(
      'claude',
      [{ sku: 'SKU-1', result: createResult({ status: 'success', fillRate: 1 }) }],
      2000,
    )

    writeRunReport(report, outputPath)

    const saved = JSON.parse(readFileSync(outputPath, 'utf-8')) as Record<string, unknown>
    expect(saved.tool).toBe('claude')
    expect(saved.totalProducts).toBe(1)

    rmSync(tempDir, { recursive: true, force: true })
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generateCleaningReport,
  writeCleaningReport,
  type CleaningReport,
} from '../report.js'
import { writeFileSync, mkdirSync } from 'node:fs'

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('generateCleaningReport', () => {
  it('returns a CleaningReport with correct structure', () => {
    const report = generateCleaningReport({
      totalInput: 499,
      totalOutput: 497,
      removed: [
        { sku: '2083', reason: 'Name contains "Prodotto Test"' },
        { sku: '2100', reason: 'Brand is "Brand di prova"' },
      ],
      colorsNormalized: 497,
      titlesTrimmed: 10,
    })

    expect(report.totalInput).toBe(499)
    expect(report.totalOutput).toBe(497)
    expect(report.removed).toHaveLength(2)
    expect(report.normalizationsApplied.colors).toBe(497)
    expect(report.normalizationsApplied.titles).toBe(10)
  })

  it('includes sku and reason for each removed product', () => {
    const report = generateCleaningReport({
      totalInput: 10,
      totalOutput: 8,
      removed: [
        { sku: '2083', reason: 'Test product' },
        { sku: '2100', reason: 'Test brand' },
      ],
      colorsNormalized: 8,
      titlesTrimmed: 0,
    })

    expect(report.removed[0]).toEqual({
      sku: '2083',
      reason: 'Test product',
    })
    expect(report.removed[1]).toEqual({
      sku: '2100',
      reason: 'Test brand',
    })
  })
})

describe('writeCleaningReport', () => {
  it('writes JSON with 2-space indent', () => {
    const report: CleaningReport = {
      totalInput: 10,
      totalOutput: 8,
      removed: [{ sku: '2083', reason: 'Test' }],
      normalizationsApplied: { colors: 8, titles: 3 },
    }

    writeCleaningReport(report, '/tmp/report.json')

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    )
    expect(writeFileSync).toHaveBeenCalledWith(
      '/tmp/report.json',
      JSON.stringify(report, null, 2),
      'utf-8',
    )
  })
})

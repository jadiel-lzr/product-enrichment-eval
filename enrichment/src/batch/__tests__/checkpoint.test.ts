import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  writeCheckpoint,
  loadCheckpoint,
  getCompletedSkus,
  type CheckpointData,
} from '../checkpoint.js'

describe('checkpoint', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'checkpoint-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const sampleCheckpoint: CheckpointData = {
    tool: 'claude',
    startedAt: '2026-03-13T10:00:00Z',
    lastUpdatedAt: '2026-03-13T10:05:00Z',
    completed: [
      { sku: 'SKU001', status: 'success' },
      { sku: 'SKU002', status: 'partial' },
      { sku: 'SKU003', status: 'failed' },
    ],
  }

  describe('writeCheckpoint', () => {
    it('creates valid JSON file (atomic write via temp + rename)', () => {
      const filePath = join(tempDir, 'checkpoint.json')

      writeCheckpoint(filePath, sampleCheckpoint)

      const loaded = loadCheckpoint(filePath)
      expect(loaded).toEqual(sampleCheckpoint)
    })
  })

  describe('loadCheckpoint', () => {
    it('returns parsed CheckpointData from existing file', () => {
      const filePath = join(tempDir, 'checkpoint.json')
      writeFileSync(filePath, JSON.stringify(sampleCheckpoint, null, 2), 'utf-8')

      const result = loadCheckpoint(filePath)

      expect(result).toEqual(sampleCheckpoint)
      expect(result?.tool).toBe('claude')
      expect(result?.completed).toHaveLength(3)
    })

    it('returns undefined for missing file', () => {
      const result = loadCheckpoint(join(tempDir, 'nonexistent.json'))
      expect(result).toBeUndefined()
    })

    it('returns undefined for corrupt JSON file', () => {
      const filePath = join(tempDir, 'corrupt.json')
      writeFileSync(filePath, '{ invalid json content !!!', 'utf-8')

      const result = loadCheckpoint(filePath)
      expect(result).toBeUndefined()
    })
  })

  describe('getCompletedSkus', () => {
    it('returns Set of completed SKU strings', () => {
      const result = getCompletedSkus(sampleCheckpoint)

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(3)
      expect(result.has('SKU001')).toBe(true)
      expect(result.has('SKU002')).toBe(true)
      expect(result.has('SKU003')).toBe(true)
    })

    it('returns empty Set for undefined checkpoint', () => {
      const result = getCompletedSkus(undefined)
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })
  })
})

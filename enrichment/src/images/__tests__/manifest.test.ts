import { describe, it, expect, afterEach } from 'vitest'
import { writeManifest, readManifest } from '../manifest.js'
import type { ImageManifest, ImageManifestEntry } from '../manifest.js'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'manifest-test-' + Date.now())

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
})

describe('writeManifest', () => {
  it('writes a JSON file with 2-space indent', () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const filePath = join(TEST_DIR, 'manifest.json')

    const entries: ImageManifest = [
      {
        url: 'https://example.com/img1.jpg',
        sku: 'SKU001',
        index: 0,
        status: 'reachable',
        contentType: 'image/jpeg',
        fileSize: 12345,
        localPath: 'data/images/SKU001_0.jpg',
      },
    ]

    writeManifest(entries, filePath)

    expect(existsSync(filePath)).toBe(true)

    const raw = require('node:fs').readFileSync(filePath, 'utf-8')
    expect(raw).toBe(JSON.stringify(entries, null, 2))
  })

  it('creates parent directory if it does not exist', () => {
    const nested = join(TEST_DIR, 'nested', 'deep', 'manifest.json')

    const entries: ImageManifest = [
      {
        url: 'https://example.com/img2.png',
        sku: 'SKU002',
        index: 1,
        status: 'unreachable',
        error: 'Timeout',
      },
    ]

    writeManifest(entries, nested)
    expect(existsSync(nested)).toBe(true)
  })
})

describe('readManifest', () => {
  it('round-trips write then read', () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const filePath = join(TEST_DIR, 'round-trip.json')

    const entries: ImageManifest = [
      {
        url: 'https://example.com/a.jpg',
        sku: 'A1',
        index: 0,
        status: 'reachable',
        contentType: 'image/jpeg',
        fileSize: 100,
        localPath: 'data/images/A1_0.jpg',
      },
      {
        url: 'https://example.com/b.png',
        sku: 'B2',
        index: 0,
        status: 'unreachable',
        error: '404 Not Found',
      },
    ]

    writeManifest(entries, filePath)
    const result = readManifest(filePath)

    expect(result).toEqual(entries)
  })

  it('preserves all optional fields correctly', () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const filePath = join(TEST_DIR, 'optional-fields.json')

    const entryWithAllFields: ImageManifestEntry = {
      url: 'https://example.com/full.jpg',
      sku: 'FULL',
      index: 0,
      status: 'reachable',
      contentType: 'image/jpeg',
      fileSize: 5000,
      localPath: 'data/images/FULL_0.jpg',
    }

    const entryWithMinFields: ImageManifestEntry = {
      url: 'https://example.com/min.jpg',
      sku: 'MIN',
      index: 0,
      status: 'unreachable',
      error: 'Connection refused',
    }

    writeManifest([entryWithAllFields, entryWithMinFields], filePath)
    const result = readManifest(filePath)

    expect(result[0].contentType).toBe('image/jpeg')
    expect(result[0].localPath).toBe('data/images/FULL_0.jpg')
    expect(result[1].contentType).toBeUndefined()
    expect(result[1].localPath).toBeUndefined()
    expect(result[1].error).toBe('Connection refused')
  })
})

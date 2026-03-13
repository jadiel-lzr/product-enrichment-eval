import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractExtension, downloadImage, downloadAllImages } from '../downloader.js'
import type { ImageManifestEntry } from '../manifest.js'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'

const TEST_DIR = join(tmpdir(), 'downloader-test-' + Date.now())
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
})

describe('extractExtension', () => {
  it('extracts .jpg from simple URL', () => {
    expect(extractExtension('https://example.com/image.jpg')).toBe('jpg')
  })

  it('extracts .png from URL with query params', () => {
    expect(extractExtension('https://example.com/photo.png?width=100&quality=80')).toBe('png')
  })

  it('extracts .webp from URL with path segments', () => {
    expect(extractExtension('https://cdn.example.com/products/abc/main.webp')).toBe('webp')
  })

  it('defaults to jpg when no extension found', () => {
    expect(extractExtension('https://example.com/images/no-extension')).toBe('jpg')
  })

  it('defaults to jpg for URLs ending in slash', () => {
    expect(extractExtension('https://example.com/images/')).toBe('jpg')
  })

  it('handles uppercase extensions', () => {
    expect(extractExtension('https://example.com/PHOTO.JPG')).toBe('jpg')
  })
})

describe('downloadImage', () => {
  it('downloads and saves image to disk', async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const destPath = join(TEST_DIR, 'test.jpg')
    const imageData = Buffer.from('fake-image-data-bytes')

    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(imageData)
        controller.close()
      },
    })

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: readable,
    })

    await downloadImage('https://example.com/test.jpg', destPath)

    expect(existsSync(destPath)).toBe(true)
    const content = readFileSync(destPath)
    expect(content).toEqual(imageData)
  })

  it('throws on non-ok response', async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const destPath = join(TEST_DIR, 'fail.jpg')

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      body: null,
    })

    await expect(
      downloadImage('https://example.com/fail.jpg', destPath)
    ).rejects.toThrow('403')
  })

  it('throws when response has no body', async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const destPath = join(TEST_DIR, 'nobody.jpg')

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null,
    })

    await expect(
      downloadImage('https://example.com/nobody.jpg', destPath)
    ).rejects.toThrow('body')
  })
})

describe('downloadAllImages', () => {
  it('downloads only reachable entries', async () => {
    mkdirSync(TEST_DIR, { recursive: true })

    const imageData = Buffer.from('image-bytes')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(imageData)
          controller.close()
        },
      }),
    })

    const entries: ImageManifestEntry[] = [
      {
        url: 'https://example.com/good.jpg',
        sku: 'SKU1',
        index: 0,
        status: 'reachable',
        contentType: 'image/jpeg',
        fileSize: 100,
      },
      {
        url: 'https://example.com/bad.jpg',
        sku: 'SKU2',
        index: 0,
        status: 'unreachable',
        error: '404',
      },
    ]

    const result = await downloadAllImages(entries, TEST_DIR, 2)

    // Only the reachable entry should have been downloaded
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Reachable entry should have localPath
    const reachable = result.find(e => e.sku === 'SKU1')
    expect(reachable?.localPath).toContain('SKU1_0.jpg')

    // Unreachable entry should remain unchanged
    const unreachable = result.find(e => e.sku === 'SKU2')
    expect(unreachable?.status).toBe('unreachable')
    expect(unreachable?.localPath).toBeUndefined()
  })

  it('handles individual download failure gracefully', async () => {
    mkdirSync(TEST_DIR, { recursive: true })

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const entries: ImageManifestEntry[] = [
      {
        url: 'https://example.com/fail.jpg',
        sku: 'FAIL1',
        index: 0,
        status: 'reachable',
        contentType: 'image/jpeg',
        fileSize: 100,
      },
    ]

    const result = await downloadAllImages(entries, TEST_DIR, 1)

    const entry = result.find(e => e.sku === 'FAIL1')
    expect(entry?.status).toBe('unreachable')
    expect(entry?.error).toContain('Network error')
  })

  it('creates output directory if it does not exist', async () => {
    const nestedDir = join(TEST_DIR, 'nested', 'images')

    const imageData = Buffer.from('data')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(imageData)
          controller.close()
        },
      }),
    })

    const entries: ImageManifestEntry[] = [
      {
        url: 'https://example.com/img.png',
        sku: 'X1',
        index: 0,
        status: 'reachable',
        contentType: 'image/png',
        fileSize: 50,
      },
    ]

    await downloadAllImages(entries, nestedDir, 1)

    expect(existsSync(nestedDir)).toBe(true)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkImageUrl, runPreflight } from '../preflight.js'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

describe('checkImageUrl', () => {
  it('returns reachable for successful HEAD request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/jpeg',
        'content-length': '12345',
      }),
    })

    const result = await checkImageUrl('https://example.com/img.jpg')

    expect(result.status).toBe('reachable')
    expect(result.contentType).toBe('image/jpeg')
    expect(result.fileSize).toBe(12345)
    expect(result.url).toBe('https://example.com/img.jpg')
  })

  it('falls back to GET on 405 Method Not Allowed', async () => {
    const abortFn = vi.fn()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': '9999',
        }),
        body: {
          cancel: abortFn,
        },
      })

    const result = await checkImageUrl('https://example.com/img.png')

    expect(result.status).toBe('reachable')
    expect(result.contentType).toBe('image/png')
    expect(result.fileSize).toBe(9999)

    // Verify HEAD was called first, then GET
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1]?.method).toBe('HEAD')
    expect(calls[1][1]?.method).toBe('GET')
  })

  it('retries once on failure, then returns unreachable', async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockRejectedValueOnce(new Error('Connection timeout'))

    const result = await checkImageUrl('https://example.com/broken.jpg')

    expect(result.status).toBe('unreachable')
    expect(result.error).toContain('Connection timeout')
    expect(result.url).toBe('https://example.com/broken.jpg')

    // Should have been called twice (original + 1 retry)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns reachable on retry success after initial failure', async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/webp',
          'content-length': '5000',
        }),
      })

    const result = await checkImageUrl('https://example.com/retry.webp')

    expect(result.status).toBe('reachable')
    expect(result.contentType).toBe('image/webp')
  })

  it('returns unreachable for non-405 error status', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

    const result = await checkImageUrl('https://example.com/missing.jpg')

    expect(result.status).toBe('unreachable')
    expect(result.error).toContain('404')
  })
})

describe('runPreflight', () => {
  it('processes all URLs and returns manifest entries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/jpeg',
        'content-length': '1000',
      }),
    })

    const urls = [
      { url: 'https://example.com/a.jpg', sku: 'SKU1', index: 0 },
      { url: 'https://example.com/b.jpg', sku: 'SKU2', index: 0 },
      { url: 'https://example.com/c.jpg', sku: 'SKU2', index: 1 },
    ]

    const result = await runPreflight(urls, 5)

    expect(result).toHaveLength(3)
    expect(result[0].sku).toBe('SKU1')
    expect(result[0].index).toBe(0)
    expect(result[0].status).toBe('reachable')
    expect(result[1].sku).toBe('SKU2')
    expect(result[2].index).toBe(1)
  })

  it('handles mixed reachable and unreachable URLs', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': '500',
        }),
      })
      .mockRejectedValueOnce(new Error('DNS failure'))
      .mockRejectedValueOnce(new Error('DNS failure'))

    const urls = [
      { url: 'https://good.com/img.jpg', sku: 'GOOD', index: 0 },
      { url: 'https://bad.com/img.jpg', sku: 'BAD', index: 0 },
    ]

    const result = await runPreflight(urls, 2)

    expect(result).toHaveLength(2)
    const good = result.find(e => e.sku === 'GOOD')
    const bad = result.find(e => e.sku === 'BAD')
    expect(good?.status).toBe('reachable')
    expect(bad?.status).toBe('unreachable')
  })

  it('returns entries without localPath (set after download)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/png',
        'content-length': '200',
      }),
    })

    const urls = [
      { url: 'https://example.com/img.png', sku: 'X1', index: 0 },
    ]

    const result = await runPreflight(urls, 1)

    expect(result[0].localPath).toBeUndefined()
  })
})

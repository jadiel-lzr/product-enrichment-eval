import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, RETRY_DELAYS } from '../retry.js'

describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success-value')

    const result = await withRetry(fn, 'test-op')

    expect(result).toBe('success-value')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure with correct delays (2s, 5s)', async () => {
    const callTimes: number[] = []
    const startTime = Date.now()

    const fn = vi
      .fn()
      .mockImplementationOnce(() => {
        callTimes.push(Date.now() - startTime)
        return Promise.reject(new Error('fail-1'))
      })
      .mockImplementationOnce(() => {
        callTimes.push(Date.now() - startTime)
        return Promise.reject(new Error('fail-2'))
      })
      .mockImplementation(() => {
        callTimes.push(Date.now() - startTime)
        return Promise.resolve('success-after-retries')
      })

    const result = await withRetry(fn, 'test-op')

    expect(result).toBe('success-after-retries')
    expect(fn).toHaveBeenCalledTimes(3)
    // First call is immediate (< 100ms tolerance)
    expect(callTimes[0]).toBeLessThan(100)
    // Second call is after ~2s delay
    expect(callTimes[1]).toBeGreaterThanOrEqual(1900)
    expect(callTimes[1]).toBeLessThan(3000)
    // Third call is after ~2s + ~5s delay
    expect(callTimes[2]).toBeGreaterThanOrEqual(6900)
    expect(callTimes[2]).toBeLessThan(8000)
  }, 15_000)

  it('throws after 3 attempts (1 initial + 2 retries)', async () => {
    const fn = vi.fn().mockImplementation(() =>
      Promise.reject(new Error('persistent-failure')),
    )

    await expect(withRetry(fn, 'test-op')).rejects.toThrow('persistent-failure')
    expect(fn).toHaveBeenCalledTimes(3)
  }, 15_000)

  it('has correct delay constants (2s, 5s)', () => {
    expect(RETRY_DELAYS).toEqual([2000, 5000])
  })
})

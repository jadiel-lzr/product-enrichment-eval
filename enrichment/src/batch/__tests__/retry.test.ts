import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, RETRY_DELAYS } from '../retry.js'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success-value')

    const result = await withRetry(fn, 'test-op')

    expect(result).toBe('success-value')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure with correct delays (2s, 5s)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('success-after-retries')

    const promise = withRetry(fn, 'test-op')

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)

    // Wait 2s for first retry
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0])
    expect(fn).toHaveBeenCalledTimes(2)

    // Wait 5s for second retry
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1])
    expect(fn).toHaveBeenCalledTimes(3)

    const result = await promise
    expect(result).toBe('success-after-retries')
  })

  it('throws after 3 attempts (1 initial + 2 retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent-failure'))

    const promise = withRetry(fn, 'test-op')

    // First attempt
    await vi.advanceTimersByTimeAsync(0)

    // First retry after 2s
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0])

    // Second retry after 5s
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1])

    await expect(promise).rejects.toThrow('persistent-failure')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('has correct delay constants (2s, 5s)', () => {
    expect(RETRY_DELAYS).toEqual([2000, 5000])
  })
})

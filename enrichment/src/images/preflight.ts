import pLimit from 'p-limit'
import type { ImageManifestEntry } from './manifest.js'

const REQUEST_TIMEOUT_MS = 10_000
const RETRY_DELAY_MS = 1_000

export interface ImageStatus {
  readonly url: string
  readonly status: 'reachable' | 'unreachable'
  readonly contentType?: string
  readonly fileSize?: number
  readonly error?: string
}

function createTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

async function attemptHead(url: string): Promise<ImageStatus> {
  const response = await fetch(url, {
    method: 'HEAD',
    signal: createTimeoutSignal(REQUEST_TIMEOUT_MS),
  })

  if (response.ok) {
    return {
      url,
      status: 'reachable',
      contentType: response.headers.get('content-type') ?? undefined,
      fileSize: response.headers.has('content-length')
        ? Number(response.headers.get('content-length'))
        : undefined,
    }
  }

  if (response.status === 405) {
    return attemptGet(url)
  }

  throw new Error(`HTTP ${response.status} ${response.statusText ?? ''}`.trim())
}

async function attemptGet(url: string): Promise<ImageStatus> {
  const response = await fetch(url, {
    method: 'GET',
    signal: createTimeoutSignal(REQUEST_TIMEOUT_MS),
  })

  // Cancel the body to avoid consuming the full response
  if (response.body) {
    await response.body.cancel()
  }

  if (response.ok) {
    return {
      url,
      status: 'reachable',
      contentType: response.headers.get('content-type') ?? undefined,
      fileSize: response.headers.has('content-length')
        ? Number(response.headers.get('content-length'))
        : undefined,
    }
  }

  throw new Error(`HTTP ${response.status} ${response.statusText ?? ''}`.trim())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function checkImageUrl(url: string): Promise<ImageStatus> {
  try {
    return await attemptHead(url)
  } catch (firstError) {
    // Retry once after delay
    await delay(RETRY_DELAY_MS)

    try {
      return await attemptHead(url)
    } catch (retryError) {
      const message = retryError instanceof Error
        ? retryError.message
        : String(retryError)

      return {
        url,
        status: 'unreachable',
        error: message,
      }
    }
  }
}

const DEFAULT_CONCURRENCY = 10
const PROGRESS_INTERVAL = 100

export async function runPreflight(
  urls: ReadonlyArray<{ readonly url: string; readonly sku: string; readonly index: number }>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<ImageManifestEntry[]> {
  const limit = pLimit(concurrency)
  let completed = 0

  const tasks = urls.map((entry) =>
    limit(async () => {
      const result = await checkImageUrl(entry.url)
      completed += 1

      if (completed % PROGRESS_INTERVAL === 0 || completed === urls.length) {
        console.log(`[Preflight] ${completed}/${urls.length} checked...`)
      }

      return {
        url: entry.url,
        sku: entry.sku,
        index: entry.index,
        status: result.status,
        contentType: result.contentType,
        fileSize: result.fileSize,
        error: result.error,
      } satisfies ImageManifestEntry
    })
  )

  return Promise.all(tasks)
}

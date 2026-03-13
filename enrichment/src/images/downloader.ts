import { createWriteStream, mkdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import pLimit from 'p-limit'
import type { ImageManifestEntry } from './manifest.js'

const DEFAULT_EXTENSION = 'jpg'
const DEFAULT_CONCURRENCY = 10
const PROGRESS_INTERVAL = 50

export function extractExtension(url: string): string {
  const pathname = new URL(url).pathname
  const lastSegment = pathname.split('/').pop() ?? ''
  const dotIndex = lastSegment.lastIndexOf('.')

  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) {
    return DEFAULT_EXTENSION
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

export async function downloadImage(
  url: string,
  destPath: string,
): Promise<void> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} for ${url}`)
  }

  if (!response.body) {
    throw new Error(`Download failed: no response body for ${url}`)
  }

  const nodeReadable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  await pipeline(nodeReadable, createWriteStream(destPath))
}

export async function downloadAllImages(
  entries: readonly ImageManifestEntry[],
  imagesDir: string,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<ImageManifestEntry[]> {
  mkdirSync(imagesDir, { recursive: true })

  const limit = pLimit(concurrency)
  let completed = 0

  const reachableEntries = entries.filter((e) => e.status === 'reachable')
  const unreachableEntries = entries.filter((e) => e.status !== 'reachable')

  const downloadTasks = reachableEntries.map((entry) =>
    limit(async (): Promise<ImageManifestEntry> => {
      const ext = extractExtension(entry.url)
      const filename = `${entry.sku}_${entry.index}.${ext}`
      const destPath = join(imagesDir, filename)

      try {
        await downloadImage(entry.url, destPath)
        completed += 1

        if (completed % PROGRESS_INTERVAL === 0 || completed === reachableEntries.length) {
          console.log(`[Download] ${completed}/${reachableEntries.length} saved...`)
        }

        return {
          ...entry,
          localPath: destPath,
        }
      } catch (error) {
        completed += 1
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[Download] Failed ${entry.url}: ${message}`)

        return {
          ...entry,
          status: 'unreachable',
          error: message,
        }
      }
    })
  )

  const downloadedEntries = await Promise.all(downloadTasks)
  return [...downloadedEntries, ...unreachableEntries]
}

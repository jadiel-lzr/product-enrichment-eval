import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ImageManifestEntry {
  readonly url: string
  readonly sku: string
  readonly index: number
  readonly status: 'reachable' | 'unreachable'
  readonly contentType?: string
  readonly fileSize?: number
  readonly localPath?: string
  readonly error?: string
}

export type ImageManifest = readonly ImageManifestEntry[]

export function writeManifest(
  entries: ImageManifest,
  filePath: string,
): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8')
}

export function readManifest(filePath: string): ImageManifestEntry[] {
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as ImageManifestEntry[]
}

import {
  writeFileSync,
  renameSync,
  readFileSync,
  existsSync,
} from 'node:fs'

export interface CheckpointData {
  readonly tool: string
  readonly startedAt: string
  readonly lastUpdatedAt: string
  readonly completed: ReadonlyArray<{
    readonly sku: string
    readonly status: 'success' | 'partial' | 'failed'
  }>
}

export function writeCheckpoint(
  path: string,
  data: CheckpointData,
): void {
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, path)
}

export function loadCheckpoint(
  path: string,
): CheckpointData | undefined {
  if (!existsSync(path)) {
    return undefined
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as CheckpointData
  } catch {
    return undefined
  }
}

export function getCompletedSkus(
  checkpoint: CheckpointData | undefined,
): ReadonlySet<string> {
  if (!checkpoint) {
    return new Set()
  }
  return new Set(
    checkpoint.completed
      .filter((c) => c.status !== 'failed')
      .map((c) => c.sku),
  )
}

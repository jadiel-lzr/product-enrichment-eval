import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import pLimit from 'p-limit'
import type { EnrichmentAdapter, EnrichmentResult } from '../adapters/types.js'
import { buildEnrichmentMetadata } from '../adapters/types.js'
import { prepareProductImages } from '../images/resizer.js'
import { writeProductCSV } from '../parsers/csv-writer.js'
import type { Product } from '../types/product.js'
import {
  getCompletedSkus,
  loadCheckpoint,
  writeCheckpoint,
  type CheckpointData,
} from './checkpoint.js'
import type { RunResult } from './report.js'

export interface RunBatchOptions {
  readonly adapter: EnrichmentAdapter
  readonly products: readonly Product[]
  readonly outputPath: string
  readonly checkpointDir: string
  readonly manifestPath: string
  readonly imagesDir: string
  readonly concurrency: number
}

export interface RunBatchResult {
  readonly tool: string
  readonly results: ReadonlyArray<RunResult>
  readonly rows: readonly Record<string, unknown>[]
  readonly checkpointPath: string
}

interface CheckpointArtifact {
  readonly row: Record<string, unknown>
  readonly result: EnrichmentResult
}

interface CheckpointState extends CheckpointData {
  readonly artifacts: Record<string, CheckpointArtifact>
}

export const DEFAULT_CONCURRENCY: Record<string, number> = {
  claude: 3,
  gemini: 5,
  firecrawl: 2,
  perplexity: 3,
}

export async function runBatch(
  options: RunBatchOptions,
): Promise<RunBatchResult> {
  mkdirSync(options.checkpointDir, { recursive: true })

  const checkpointPath = join(
    options.checkpointDir,
    `checkpoint-${options.adapter.name}.json`,
  )
  const checkpoint = loadCheckpoint(checkpointPath)
  const completedSkus = getCompletedSkus(checkpoint)
  const remainingProducts = options.products.filter(
    (product) => !completedSkus.has(product.sku),
  )
  const startingCheckpoint = toCheckpointState(checkpoint, options.adapter.name)

  if (checkpoint) {
    console.log(
      `[${options.adapter.name}] Resuming: ${completedSkus.size} already done, ${remainingProducts.length} remaining`,
    )
  } else {
    console.log(
      `[${options.adapter.name}] Starting: ${options.products.length} products`,
    )
  }

  const limit = pLimit(options.concurrency)
  let processedCount = completedSkus.size
  let checkpointState = startingCheckpoint

  const newResults = await Promise.all(
    remainingProducts.map((product) =>
      limit(async () => {
        const result = await enrichProduct(
          product,
          options.adapter,
          options.manifestPath,
          options.imagesDir,
        )
        const row = mergeProductRow(product, options.adapter.name, result)

        checkpointState = updateCheckpointState(
          checkpointState,
          product.sku,
          result,
          row,
        )
        writeCheckpoint(checkpointPath, checkpointState)

        processedCount += 1
        console.log(
          `[${options.adapter.name}] ${processedCount}/${options.products.length} ${product.sku} → ${result.status} (${result.enrichedFields.length} fields)`,
        )

        return {
          sku: product.sku,
          result,
          row,
        }
      }),
    ),
  )

  const resumedResults = options.products
    .filter((product) => completedSkus.has(product.sku))
    .map((product) => {
      const artifact = checkpointState.artifacts[product.sku]
      if (artifact) {
        return {
          sku: product.sku,
          result: artifact.result,
          row: artifact.row,
        }
      }

      const completedEntry = checkpointState.completed.find(
        (entry) => entry.sku === product.sku,
      )
      const result = buildResumedResult(completedEntry?.status ?? 'partial')
      return {
        sku: product.sku,
        result,
        row: mergeProductRow(product, options.adapter.name, result),
      }
    })

  const newResultsBySku = new Map(
    newResults.map((entry) => [entry.sku, entry] as const),
  )
  const resumedBySku = new Map(
    resumedResults.map((entry) => [entry.sku, entry] as const),
  )
  const orderedEntries = options.products
    .map((product) =>
      newResultsBySku.get(product.sku) ?? resumedBySku.get(product.sku),
    )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  writeProductCSV(orderedEntries.map((entry) => entry.row), options.outputPath)

  return {
    tool: options.adapter.name,
    results: orderedEntries.map(({ sku, result }) => ({ sku, result })),
    rows: orderedEntries.map((entry) => entry.row),
    checkpointPath,
  }
}

async function enrichProduct(
  product: Product,
  adapter: EnrichmentAdapter,
  manifestPath: string,
  imagesDir: string,
): Promise<EnrichmentResult> {
  try {
    const images = await prepareProductImages(product.sku, manifestPath, imagesDir)
    return await adapter.enrich(product, images)
  } catch (error) {
    return {
      fields: {},
      status: 'failed',
      fillRate: 0,
      enrichedFields: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function mergeProductRow(
  product: Product,
  toolName: string,
  result: EnrichmentResult,
): Record<string, unknown> {
  const metadata = buildEnrichmentMetadata(toolName, result)

  return {
    ...product,
    ...result.fields,
    ...metadata,
  }
}

function buildResumedResult(
  status: 'success' | 'partial' | 'failed',
): EnrichmentResult {
  return {
    fields: {},
    status,
    fillRate: 0,
    enrichedFields: [],
    error:
      status === 'failed'
        ? 'Recovered from checkpoint without stored enrichment payload'
        : undefined,
  }
}

function toCheckpointState(
  checkpoint: CheckpointData | undefined,
  toolName: string,
): CheckpointState {
  const rawCheckpoint = checkpoint as
    | (CheckpointData & {
        readonly artifacts?: Record<string, CheckpointArtifact>
      })
    | undefined

  const now = new Date().toISOString()
  return {
    tool: toolName,
    startedAt: checkpoint?.startedAt ?? now,
    lastUpdatedAt: checkpoint?.lastUpdatedAt ?? now,
    completed: [...(checkpoint?.completed ?? [])],
    artifacts: { ...(rawCheckpoint?.artifacts ?? {}) },
  }
}

function updateCheckpointState(
  checkpointState: CheckpointState,
  sku: string,
  result: EnrichmentResult,
  row: Record<string, unknown>,
): CheckpointState {
  const completedBySku = new Map(
    checkpointState.completed.map((entry) => [entry.sku, entry.status] as const),
  )
  completedBySku.set(sku, result.status)

  return {
    ...checkpointState,
    lastUpdatedAt: new Date().toISOString(),
    completed: Array.from(completedBySku.entries()).map(
      ([completedSku, status]) => ({
        sku: completedSku,
        status,
      }),
    ),
    artifacts: {
      ...checkpointState.artifacts,
      [sku]: { row, result },
    },
  }
}

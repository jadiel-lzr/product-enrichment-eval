import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { createClaudeAdapter } from '../adapters/claude-adapter.js'
import { createFirecrawlAdapter } from '../adapters/firecrawl-adapter.js'
import { createGeminiAdapter } from '../adapters/gemini-adapter.js'
import { createGptAdapter } from '../adapters/gpt-adapter.js'
import type { EnrichmentAdapter } from '../adapters/types.js'
import { generateRunReport, writeRunReport } from '../batch/report.js'
import { DEFAULT_CONCURRENCY, runBatch } from '../batch/runner.js'
import { cacheNoImgImages } from '../images/noimg-cache.js'
import { parseProductCSV } from '../parsers/csv-reader.js'
import { writeProductCSV } from '../parsers/csv-writer.js'
import { ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'

type ToolName = 'claude' | 'gemini' | 'firecrawl' | 'gpt'
type ToolOption = ToolName | 'all' | 'all-llm'

const LLM_TOOLS: readonly ToolName[] = ['claude', 'gemini', 'gpt']

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../../')
const envPath = resolve(scriptDir, '../../.env')
const dataDir = resolve(repoRoot, 'data')
const baseCsvPath = resolve(dataDir, 'base.csv')
const manifestPath = resolve(dataDir, 'image-manifest.json')
const imagesDir = resolve(dataDir, 'images')
const checkpointsDir = resolve(dataDir, 'checkpoints')
const reportsDir = resolve(dataDir, 'reports')

// noimg-specific paths
const frontendDataDir = resolve(repoRoot, 'frontend/public/data')
const noImgCsvPath = resolve(frontendDataDir, 'enriched-noimg-claude.csv')
const noImgManifestPath = resolve(dataDir, 'noimg-image-manifest.json')
const noImgImagesDir = resolve(dataDir, 'images-noimg')
const noImgCheckpointsDir = resolve(dataDir, 'checkpoints/noimg-enrich')
const noImgTempOutputPath = resolve(dataDir, 'enriched-noimg-enrich-temp.csv')
const noImgOutputPath = resolve(dataDir, 'enriched-noimg-claude.csv')

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

const TOOL_FACTORIES: Record<ToolName, () => EnrichmentAdapter> = {
  claude: createClaudeAdapter,
  gemini: createGeminiAdapter,
  firecrawl: () => createFirecrawlAdapter(),
  gpt: createGptAdapter,
}

/** Columns to preserve from noimg CSV (not overwritten by enrichment) */
const NOIMG_PRESERVE_COLUMNS = [
  'source_url',
  'image_links',
  'image_flags',
  'image_confidence',
  'confidence_score',
  'match_reason',
] as const

/** Enrichment metadata columns that get updated */
const ENRICHMENT_META_COLUMNS = [
  '_enrichment_tool',
  '_enrichment_status',
  '_enrichment_fill_rate',
  '_enriched_fields',
  '_enrichment_error',
  '_enrichment_accuracy_score',
] as const

interface ImageFlag {
  readonly url: string
  readonly reason: string
}

function getUnflaggedImageUrls(row: Record<string, unknown>): string[] {
  const rawLinks = typeof row.image_links === 'string' ? row.image_links : ''
  if (!rawLinks.trim()) return []

  const allUrls = rawLinks.split('|').map((u: string) => u.trim()).filter(Boolean)

  // Parse flags
  let flaggedUrls = new Set<string>()
  const rawFlags = row.image_flags
  if (typeof rawFlags === 'string' && rawFlags.trim()) {
    try {
      const flags: ImageFlag[] = JSON.parse(rawFlags)
      flaggedUrls = new Set(flags.map((f) => f.url))
    } catch {
      // Malformed flags — treat all as unflagged
    }
  } else if (Array.isArray(rawFlags)) {
    flaggedUrls = new Set(
      (rawFlags as ImageFlag[]).filter((f) => typeof f.url === 'string').map((f) => f.url),
    )
  }

  return allUrls.filter((url: string) => !flaggedUrls.has(url))
}

async function runNoImgEnrichment(tool: ToolName, limit: number | undefined): Promise<void> {
  if (!existsSync(noImgCsvPath)) {
    console.error(`No-image enriched CSV not found: ${noImgCsvPath}`)
    process.exitCode = 1
    return
  }

  // Load and parse products from noimg CSV
  const { products: allProducts, errors } = parseProductCSV(noImgCsvPath)
  if (errors.length > 0) {
    console.warn(`Loaded ${allProducts.length} products with ${errors.length} parse errors`)
  }

  // Filter to products with unflagged images
  const productsWithImages = allProducts.filter((product) => {
    const unflagged = getUnflaggedImageUrls(product as unknown as Record<string, unknown>)
    return unflagged.length > 0
  })

  const products = limit ? productsWithImages.slice(0, limit) : productsWithImages
  console.log(`[noimg] ${allProducts.length} total products, ${productsWithImages.length} with unflagged images`)
  if (limit) {
    console.log(`[noimg] Limiting to ${products.length} products`)
  }

  if (products.length === 0) {
    console.log('[noimg] No products to enrich')
    return
  }

  // Step 1: Cache images locally
  console.log('[noimg] Step 1: Caching images...')
  const productsForCache = products.map((product) => ({
    sku: product.sku,
    imageLinks: getUnflaggedImageUrls(product as unknown as Record<string, unknown>),
  }))
  await cacheNoImgImages(productsForCache, noImgImagesDir, noImgManifestPath)

  // Step 2: Run enrichment batch
  console.log(`[noimg] Step 2: Running ${tool} enrichment...`)
  mkdirSync(noImgCheckpointsDir, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  const adapter = TOOL_FACTORIES[tool]()
  const start = Date.now()
  const batchResult = await runBatch({
    adapter,
    products,
    outputPath: noImgTempOutputPath,
    checkpointDir: noImgCheckpointsDir,
    manifestPath: noImgManifestPath,
    imagesDir: noImgImagesDir,
    concurrency: DEFAULT_CONCURRENCY[adapter.name] ?? 1,
  })
  const durationMs = Date.now() - start
  const report = generateRunReport(tool, batchResult.results, durationMs)
  writeRunReport(report, resolve(reportsDir, `run-report-noimg-${tool}.json`))

  console.log(
    `[noimg] Enrichment complete: ${report.success} success, ${report.partial} partial, ${report.failed} failed (${report.duration})`,
  )

  // Step 3: Merge enrichment results back into the full noimg CSV
  console.log('[noimg] Step 3: Merging results...')
  mergeNoImgResults(noImgCsvPath, batchResult.rows, noImgOutputPath)

  // Clean up temp CSV
  if (existsSync(noImgTempOutputPath)) {
    const { unlinkSync } = await import('node:fs')
    unlinkSync(noImgTempOutputPath)
  }

  console.log(`[noimg] Output: ${noImgOutputPath}`)
  console.log(`[noimg] Copy to frontend manually: cp ${noImgOutputPath} ${noImgCsvPath}`)
}

function mergeNoImgResults(
  originalCsvPath: string,
  enrichedRows: readonly Record<string, unknown>[],
  outputPath: string,
): void {
  // Back up original
  const backupPath = originalCsvPath.replace('.csv', `-backup-${Date.now()}.csv`)
  copyFileSync(originalCsvPath, backupPath)
  console.log(`[noimg] Backed up original → ${backupPath}`)

  // Index enrichment results by SKU
  const enrichedBySku = new Map<string, Record<string, unknown>>()
  for (const row of enrichedRows) {
    const sku = typeof row.sku === 'string' ? row.sku : ''
    if (sku) enrichedBySku.set(sku, row)
  }

  // Read original CSV as raw strings (preserves all columns exactly)
  const csvText = readFileSync(originalCsvPath, 'utf-8')
  const { data: rawRows } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  // Merge: update enrichment fields, preserve noimg columns
  const mergedRows = rawRows.map((originalRow) => {
    const sku = originalRow.sku ?? ''
    const enriched = enrichedBySku.get(sku)

    if (!enriched) return originalRow

    const merged: Record<string, unknown> = { ...originalRow }

    // Update the 12 target enrichment fields (only if enrichment produced non-empty values)
    for (const field of ENRICHMENT_TARGET_FIELDS) {
      const enrichedValue = enriched[field]
      if (enrichedValue !== undefined && enrichedValue !== '') {
        merged[field] = enrichedValue
      }
    }

    // Update enrichment metadata
    for (const col of ENRICHMENT_META_COLUMNS) {
      if (enriched[col] !== undefined) {
        merged[col] = enriched[col]
      }
    }

    // Update accuracy score if present
    if (enriched.accuracy_score !== undefined && enriched.accuracy_score !== '') {
      merged.accuracy_score = enriched.accuracy_score
    }

    return merged
  })

  writeProductCSV(mergedRows, outputPath)
  console.log(`[noimg] Merged ${enrichedBySku.size} enrichment results into ${rawRows.length} rows`)
}

async function main(): Promise<void> {
  const cliArgs = process.argv.slice(2)
  const tool = parseToolArg(cliArgs)
  const isNoImg = cliArgs.includes('--noimg')

  if (!tool) {
    printUsage()
    process.exitCode = 1
    return
  }

  if (!(tool in TOOL_FACTORIES) && tool !== 'all' && tool !== 'all-llm') {
    console.error(`Invalid tool: ${tool}`)
    printUsage()
    process.exitCode = 1
    return
  }

  if (isNoImg) {
    if (tool === 'all' || tool === 'all-llm') {
      console.error('--noimg only supports a single tool (e.g. --tool claude)')
      process.exitCode = 1
      return
    }
    await runNoImgEnrichment(tool, parseLimitArg(cliArgs))
    return
  }

  mkdirSync(checkpointsDir, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  const limit = parseLimitArg(cliArgs)

  const { products: allProducts, errors } = parseProductCSV(baseCsvPath)
  if (errors.length > 0) {
    console.warn(`Loaded ${allProducts.length} products with ${errors.length} parse errors`)
  }

  const products = limit ? allProducts.slice(0, limit) : allProducts
  if (limit) {
    console.log(`Limiting to ${products.length} of ${allProducts.length} products`)
  }

  const tools =
    tool === 'all'
      ? (Object.keys(TOOL_FACTORIES) as ToolName[])
      : tool === 'all-llm'
        ? [...LLM_TOOLS]
        : [tool]

  for (const toolName of tools) {
    const adapter = TOOL_FACTORIES[toolName]()
    const start = Date.now()
    const batchResult = await runBatch({
      adapter,
      products,
      outputPath: resolve(dataDir, `enriched-${toolName}.csv`),
      checkpointDir: checkpointsDir,
      manifestPath,
      imagesDir,
      concurrency: DEFAULT_CONCURRENCY[adapter.name] ?? 1,
    })
    const durationMs = Date.now() - start
    const report = generateRunReport(toolName, batchResult.results, durationMs)
    writeRunReport(report, resolve(reportsDir, `run-report-${toolName}.json`))

    console.log(
      `[${toolName}] Complete: ${report.success} success, ${report.partial} partial, ${report.failed} failed (${report.duration})`,
    )
  }
}

function parseToolArg(args: readonly string[]): ToolOption | undefined {
  const toolIndex = args.indexOf('--tool')
  if (toolIndex === -1) {
    return undefined
  }

  return args[toolIndex + 1] as ToolOption | undefined
}

function parseLimitArg(args: readonly string[]): number | undefined {
  const limitIndex = args.indexOf('--limit')
  if (limitIndex === -1) return undefined

  const value = Number(args[limitIndex + 1])
  if (!Number.isInteger(value) || value <= 0) {
    console.error('--limit must be a positive integer')
    return undefined
  }
  return value
}

function printUsage(): void {
  const scriptName = 'npx tsx src/scripts/enrich.ts'
  console.error(`Usage: ${scriptName} --tool claude|gemini|firecrawl|gpt|all|all-llm [--limit N] [--noimg]`)
}

main().catch((error) => {
  console.error('Enrichment run failed:', error)
  process.exit(1)
})

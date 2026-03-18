import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createNoImgClaudeAdapter } from '../adapters/noimg-claude-adapter.js'
import { generateRunReport, writeRunReport } from '../batch/report.js'
import { runBatch } from '../batch/runner.js'
import { parseProductCSV } from '../parsers/csv-reader.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../../')
const envPath = resolve(scriptDir, '../../.env')
const dataDir = resolve(repoRoot, 'data')
const frontendDataDir = resolve(repoRoot, 'frontend/public/data')
const baseCsvPath = resolve(frontendDataDir, 'base-missing-images.csv')
const manifestPath = resolve(dataDir, 'image-manifest.json')
const imagesDir = resolve(dataDir, 'images')
const checkpointsDir = resolve(dataDir, 'checkpoints')
const reportsDir = resolve(dataDir, 'reports')

const CONCURRENCY = 1

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

function parseSkuArg(args: readonly string[]): string[] | undefined {
  const skuIndex = args.indexOf('--sku')
  if (skuIndex === -1) return undefined

  const value = args[skuIndex + 1]
  if (!value) {
    console.error('--sku requires a comma-separated list of SKUs')
    return undefined
  }
  return value.split(',').map((s) => s.trim()).filter(Boolean)
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

async function main(): Promise<void> {
  mkdirSync(checkpointsDir, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  const limit = parseLimitArg(process.argv.slice(2))
  const skuFilter = parseSkuArg(process.argv.slice(2))

  const { products: allProducts, errors } = parseProductCSV(baseCsvPath)
  if (errors.length > 0) {
    console.warn(`Loaded ${allProducts.length} products with ${errors.length} parse errors`)
  }

  let products: typeof allProducts
  if (skuFilter) {
    products = allProducts.filter((p) => skuFilter.includes(p.sku))
    console.log(`Filtering to ${products.length} products by SKU: ${skuFilter.join(', ')}`)
  } else {
    products = limit ? allProducts.slice(0, limit) : allProducts
    console.log(
      limit
        ? `Limiting to ${products.length} of ${allProducts.length} products`
        : `Processing ${products.length} products`,
    )
  }

  const adapter = createNoImgClaudeAdapter()
  const outputPath = resolve(dataDir, 'enriched-noimg-claude.csv')

  const start = Date.now()
  const batchResult = await runBatch({
    adapter,
    products,
    outputPath,
    checkpointDir: checkpointsDir,
    manifestPath,
    imagesDir,
    concurrency: CONCURRENCY,
  })
  const durationMs = Date.now() - start

  const report = generateRunReport('noimg-claude', batchResult.results, durationMs)
  writeRunReport(report, resolve(reportsDir, 'run-report-noimg-claude.json'))

  const frontendOutputPath = resolve(frontendDataDir, 'enriched-noimg-claude.csv')
  copyFileSync(outputPath, frontendOutputPath)

  console.log(
    `[noimg-claude] Complete: ${report.success} success, ${report.partial} partial, ${report.failed} failed (${report.duration})`,
  )
  console.log(`Output: ${outputPath}`)
  console.log(`Frontend copy: ${frontendOutputPath}`)
}

main().catch((error) => {
  console.error('No-image enrichment run failed:', error)
  process.exit(1)
})

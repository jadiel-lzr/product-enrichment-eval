import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClaudeAdapter } from '../adapters/claude-adapter.js'
import { createFirecrawlAdapter } from '../adapters/firecrawl-adapter.js'
import { createGeminiAdapter } from '../adapters/gemini-adapter.js'
import { createGptAdapter } from '../adapters/gpt-adapter.js'
import type { EnrichmentAdapter } from '../adapters/types.js'
import { generateRunReport, writeRunReport } from '../batch/report.js'
import { DEFAULT_CONCURRENCY, runBatch } from '../batch/runner.js'
import { parseProductCSV } from '../parsers/csv-reader.js'

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

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

const TOOL_FACTORIES: Record<ToolName, () => EnrichmentAdapter> = {
  claude: createClaudeAdapter,
  gemini: createGeminiAdapter,
  firecrawl: () => createFirecrawlAdapter(),
  gpt: createGptAdapter,
}

async function main(): Promise<void> {
  const tool = parseToolArg(process.argv.slice(2))

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

  mkdirSync(checkpointsDir, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  const limit = parseLimitArg(process.argv.slice(2))

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
  console.error(`Usage: ${scriptName} --tool claude|gemini|firecrawl|gpt|all|all-llm [--limit N]`)
}

main().catch((error) => {
  console.error('Enrichment run failed:', error)
  process.exit(1)
})

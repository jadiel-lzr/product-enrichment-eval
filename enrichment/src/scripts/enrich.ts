import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClaudeAdapter } from '../adapters/claude-adapter.js'
import { createFirecrawlAdapter } from '../adapters/firecrawl-adapter.js'
import { createGeminiAdapter } from '../adapters/gemini-adapter.js'
import { createPerplexityAdapter } from '../adapters/perplexity-adapter.js'
import type { EnrichmentAdapter } from '../adapters/types.js'
import { generateRunReport, writeRunReport } from '../batch/report.js'
import { DEFAULT_CONCURRENCY, runBatch } from '../batch/runner.js'
import { parseProductCSV } from '../parsers/csv-reader.js'

type ToolName = 'claude' | 'gemini' | 'firecrawl' | 'perplexity'
type ToolOption = ToolName | 'all'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../../')
const dataDir = resolve(repoRoot, 'data')
const baseCsvPath = resolve(dataDir, 'base.csv')
const manifestPath = resolve(dataDir, 'image-manifest.json')
const imagesDir = resolve(dataDir, 'images')
const checkpointsDir = resolve(dataDir, 'checkpoints')
const reportsDir = resolve(dataDir, 'reports')

const TOOL_FACTORIES: Record<ToolName, () => EnrichmentAdapter> = {
  claude: createClaudeAdapter,
  gemini: createGeminiAdapter,
  firecrawl: () => createFirecrawlAdapter(),
  perplexity: createPerplexityAdapter,
}

async function main(): Promise<void> {
  const tool = parseToolArg(process.argv.slice(2))

  if (!tool) {
    printUsage()
    process.exitCode = 1
    return
  }

  if (!(tool in TOOL_FACTORIES) && tool !== 'all') {
    console.error(`Invalid tool: ${tool}`)
    printUsage()
    process.exitCode = 1
    return
  }

  mkdirSync(checkpointsDir, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  const { products, errors } = parseProductCSV(baseCsvPath)
  if (errors.length > 0) {
    console.warn(`Loaded ${products.length} products with ${errors.length} parse errors`)
  }

  const tools = tool === 'all' ? (Object.keys(TOOL_FACTORIES) as ToolName[]) : [tool]

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

function printUsage(): void {
  const scriptName = 'npx tsx src/scripts/enrich.ts'
  console.error(`Usage: ${scriptName} --tool claude|gemini|firecrawl|perplexity|all`)
}

main().catch((error) => {
  console.error('Enrichment run failed:', error)
  process.exit(1)
})

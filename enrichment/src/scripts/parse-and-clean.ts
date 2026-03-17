import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { parseProductCSV } from '../parsers/csv-reader.js'
import { writeProductCSV } from '../parsers/csv-writer.js'
import { cleanProducts } from '../cleaning/cleaner.js'
import { writeCleaningReport } from '../cleaning/report.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..')
const REPO_ROOT = resolve(PROJECT_ROOT, '..')

interface DatasetConfig {
  readonly label: string
  readonly sourceCsv: string
  readonly outputCsv: string
  readonly reportPath: string
}

const DATASETS: readonly DatasetConfig[] = [
  {
    label: 'With Images',
    sourceCsv: resolve(REPO_ROOT, 'originalUnEnrichedProductFeed.csv'),
    outputCsv: resolve(REPO_ROOT, 'data', 'base.csv'),
    reportPath: resolve(REPO_ROOT, 'data', 'cleaning-report.json'),
  },
  {
    label: 'Missing Images',
    sourceCsv: resolve(REPO_ROOT, 'data', 'base-missing-images.csv'),
    outputCsv: resolve(REPO_ROOT, 'data', 'base-missing-images-cleaned.csv'),
    reportPath: resolve(REPO_ROOT, 'data', 'cleaning-report-missing-images.json'),
  },
]

function processDataset(config: DatasetConfig): void {
  console.log(`\n=== ${config.label} ===`)

  const parseResult = parseProductCSV(config.sourceCsv)
  console.log(
    `Parsed ${parseResult.products.length} products from source CSV (${parseResult.errors.length} parse errors)`,
  )

  const { cleanedProducts, report } = cleanProducts(parseResult.products)

  writeProductCSV(cleanedProducts, config.outputCsv)
  writeCleaningReport(report, config.reportPath)

  console.log(`Total input:        ${report.totalInput}`)
  console.log(`Total output:       ${report.totalOutput}`)
  console.log(`Removed:            ${report.removed.length}`)
  console.log(`Colors normalized:  ${report.normalizationsApplied.colors}`)
  console.log(`Titles trimmed:     ${report.normalizationsApplied.titles}`)
  console.log(`Output: ${config.outputCsv}`)
  console.log(`Report: ${config.reportPath}`)
}

function main(): void {
  try {
    for (const dataset of DATASETS) {
      processDataset(dataset)
    }
  } catch (error) {
    console.error('parse-and-clean failed:', error)
    process.exit(1)
  }
}

main()

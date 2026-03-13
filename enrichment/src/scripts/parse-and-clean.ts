import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { parseProductCSV } from '../parsers/csv-reader.js'
import { writeProductCSV } from '../parsers/csv-writer.js'
import { cleanProducts } from '../cleaning/cleaner.js'
import { writeCleaningReport } from '../cleaning/report.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..')
const REPO_ROOT = resolve(PROJECT_ROOT, '..')

const SOURCE_CSV = resolve(REPO_ROOT, 'originalUnEnrichedProductFeed.csv')
const OUTPUT_CSV = resolve(REPO_ROOT, 'data', 'base.csv')
const REPORT_PATH = resolve(REPO_ROOT, 'data', 'cleaning-report.json')

function main(): void {
  try {
    const parseResult = parseProductCSV(SOURCE_CSV)
    console.log(
      `Parsed ${parseResult.products.length} products from source CSV (${parseResult.errors.length} parse errors)`,
    )

    const { cleanedProducts, report } = cleanProducts(parseResult.products)

    writeProductCSV(cleanedProducts, OUTPUT_CSV)
    writeCleaningReport(report, REPORT_PATH)

    console.log(`\n--- Cleaning Summary ---`)
    console.log(`Total input:        ${report.totalInput}`)
    console.log(`Total output:       ${report.totalOutput}`)
    console.log(`Removed:            ${report.removed.length}`)
    console.log(`Colors normalized:  ${report.normalizationsApplied.colors}`)
    console.log(`Titles trimmed:     ${report.normalizationsApplied.titles}`)
    console.log(`\nOutput: ${OUTPUT_CSV}`)
    console.log(`Report: ${REPORT_PATH}`)
  } catch (error) {
    console.error('parse-and-clean failed:', error)
    process.exit(1)
  }
}

main()

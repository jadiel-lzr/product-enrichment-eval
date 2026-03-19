import Papa from 'papaparse'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { JSON_COLUMNS } from './json-columns.js'

export function writeProductCSV(
  products: readonly Record<string, unknown>[],
  filePath: string,
): void {
  const serialized = products.map((product) => {
    const row: Record<string, unknown> = { ...product }

    for (const column of JSON_COLUMNS) {
      const value = row[column]
      if (Array.isArray(value)) {
        row[column] = JSON.stringify(value)
      }
    }

    return row
  })

  const allKeys = new Set<string>()
  for (const row of serialized) {
    for (const key of Object.keys(row)) {
      allKeys.add(key)
    }
  }

  const csvString = Papa.unparse(serialized, { columns: [...allKeys] })

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, csvString, 'utf-8')
}

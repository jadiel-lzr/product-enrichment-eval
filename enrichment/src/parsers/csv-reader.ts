import Papa from 'papaparse'
import { readFileSync } from 'node:fs'
import { ProductSchema, type Product } from '../types/product.js'
import { parseJsonColumns } from './json-columns.js'

interface ParseError {
  row: number
  message: string
  type: 'papaparse' | 'validation'
}

export interface ParseResult {
  products: Product[]
  errors: ParseError[]
  rowCount: number
}

export function parseProductCSV(filePath: string): ParseResult {
  const csvText = readFileSync(filePath, 'utf-8')

  const { data: rawRows, errors: papaErrors } = Papa.parse<Record<string, string>>(
    csvText,
    {
      header: true,
      skipEmptyLines: true,
    },
  )

  const parseErrors: ParseError[] = papaErrors.map((err) => ({
    row: err.row ?? -1,
    message: err.message,
    type: 'papaparse' as const,
  }))

  const products: Product[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    try {
      const transformed = parseJsonColumns(raw)
      const product = ProductSchema.parse(transformed)
      products.push(product)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      parseErrors.push({
        row: i,
        message: `Row ${i}: ${message}`,
        type: 'validation',
      })
    }
  }

  return {
    products,
    errors: parseErrors,
    rowCount: rawRows.length,
  }
}

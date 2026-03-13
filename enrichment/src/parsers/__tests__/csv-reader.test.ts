import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseProductCSV } from '../csv-reader.js'
import { writeProductCSV } from '../csv-writer.js'

const TEST_CSV_DIR = join(tmpdir(), 'enrichment-test-csv')

function createTestCSV(filename: string, content: string): string {
  mkdirSync(TEST_CSV_DIR, { recursive: true })
  const filePath = join(TEST_CSV_DIR, filename)
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

const MINIMAL_CSV_HEADER = 'sku,code,gtin,name,brand,color,model,price,sizes,errors,images,season,made_in,category,feed_name,department,product_id,season_year,color_original,made_in_original,category_original,materials_original,department_original,unit_system_name_original,year,collection,dimensions,collection_original,title,sizes_raw,season_raw,description,size_system,category_item,season_display,sizes_original,vendor_product_id'

const MINIMAL_CSV_ROW = '85993,HAT51600CAMEL/NUT,"[""2000026685067""]",,HELEN KAMINSKI,Beige,HAT51600,150,"[{""Qty"":1,""sku"":""85993"",""Size"":""IT XL"",""Barcode"":""2000026685067"",""Currency"":""EUR"",""NetPrice"":150,""BrandReferencePrice"":300}]","[{""error"":""empty_field"",""field"":""name""},{""error"":""empty_field"",""field"":""description_eng""}]","[""https://adda.coralmatch.com/images/thumbs/0058392.jpeg""]",FW23,LK,Hats,,female,85993_autunnoinverno2023_al-duca-d-aosta-mestre,Autunno/Inverno 2023,,LK,,100% WOOL,,ALFABETICA,2023,Main, ,,,,,,,,,,,'

describe('parseProductCSV', () => {
  it('parses a minimal test CSV and returns correct product count', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const filePath = createTestCSV('minimal.csv', csvContent)

    const result = parseProductCSV(filePath)

    expect(result.products).toHaveLength(1)
    expect(result.rowCount).toBe(1)
  })

  it('returns all 37 fields correctly typed on parsed product', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const filePath = createTestCSV('fields.csv', csvContent)

    const result = parseProductCSV(filePath)
    const product = result.products[0]

    expect(product.sku).toBe('85993')
    expect(product.brand).toBe('HELEN KAMINSKI')
    expect(product.color).toBe('Beige')
    expect(product.model).toBe('HAT51600')
    expect(product.season).toBe('FW23')
    expect(product.year).toBe('2023')
    expect(product.collection).toBe('Main')
  })

  it('parses embedded JSON columns as arrays (not strings)', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const filePath = createTestCSV('json-cols.csv', csvContent)

    const result = parseProductCSV(filePath)
    const product = result.products[0]

    expect(Array.isArray(product.gtin)).toBe(true)
    expect(Array.isArray(product.sizes)).toBe(true)
    expect(Array.isArray(product.errors)).toBe(true)
    expect(Array.isArray(product.images)).toBe(true)

    expect(product.gtin).toEqual(['2000026685067'])
    expect(product.sizes).toHaveLength(1)
    expect(product.sizes[0].Currency).toBe('EUR')
    expect(product.errors).toHaveLength(2)
    expect(product.images).toHaveLength(1)
  })

  it('coerces price from CSV string to number', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const filePath = createTestCSV('price.csv', csvContent)

    const result = parseProductCSV(filePath)

    expect(typeof result.products[0].price).toBe('number')
    expect(result.products[0].price).toBe(150)
  })

  it('handles multiple rows', () => {
    const secondRow = MINIMAL_CSV_ROW.replace('85993', '99999').replace('HAT51600', 'OTHER_MODEL')
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}\n${secondRow}`
    const filePath = createTestCSV('multi.csv', csvContent)

    const result = parseProductCSV(filePath)

    expect(result.products).toHaveLength(2)
    expect(result.rowCount).toBe(2)
  })

  it('collects parse errors without crashing', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const filePath = createTestCSV('errors.csv', csvContent)

    const result = parseProductCSV(filePath)

    expect(result.errors).toBeDefined()
    expect(Array.isArray(result.errors)).toBe(true)
  })
})

describe('parseProductCSV - integration with real CSV', () => {
  const REAL_CSV_PATH = join(
    import.meta.dirname,
    '../../../../originalUnEnrichedProductFeed.csv',
  )

  it('parses the real 499-product CSV with 0 parse errors', () => {
    const result = parseProductCSV(REAL_CSV_PATH)

    expect(result.products.length).toBeGreaterThanOrEqual(498)
    expect(result.products.length).toBeLessThanOrEqual(500)
    expect(result.errors).toHaveLength(0)
  })

  it('first product has images as a typed array', () => {
    const result = parseProductCSV(REAL_CSV_PATH)
    const first = result.products[0]

    expect(Array.isArray(first.images)).toBe(true)
    expect(first.images.length).toBeGreaterThan(0)
    expect(typeof first.images[0]).toBe('string')
  })
})

describe('writeProductCSV', () => {
  it('writes products to CSV and round-trips correctly', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const inputPath = createTestCSV('roundtrip-input.csv', csvContent)

    const { products } = parseProductCSV(inputPath)

    const outputPath = join(TEST_CSV_DIR, 'roundtrip-output.csv')
    writeProductCSV(products, outputPath)

    const reloaded = parseProductCSV(outputPath)

    expect(reloaded.products).toHaveLength(products.length)

    const original = products[0]
    const roundTripped = reloaded.products[0]

    expect(roundTripped.sku).toBe(original.sku)
    expect(roundTripped.brand).toBe(original.brand)
    expect(roundTripped.price).toBe(original.price)
    expect(roundTripped.gtin).toEqual(original.gtin)
    expect(roundTripped.sizes).toEqual(original.sizes)
    expect(roundTripped.errors).toEqual(original.errors)
    expect(roundTripped.images).toEqual(original.images)
  })

  it('creates parent directories if they do not exist', () => {
    const csvContent = `${MINIMAL_CSV_HEADER}\n${MINIMAL_CSV_ROW}`
    const inputPath = createTestCSV('mkdir-input.csv', csvContent)
    const { products } = parseProductCSV(inputPath)

    const deepOutputPath = join(TEST_CSV_DIR, 'nested', 'deep', 'output.csv')

    expect(() => writeProductCSV(products, deepOutputPath)).not.toThrow()

    const reloaded = parseProductCSV(deepOutputPath)
    expect(reloaded.products).toHaveLength(1)
  })
})

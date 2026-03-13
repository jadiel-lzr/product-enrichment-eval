import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { parseProductCSV } from '../parsers/csv-reader.js'
import { writeProductCSV } from '../parsers/csv-writer.js'
import { runPreflight } from '../images/preflight.js'
import { downloadAllImages } from '../images/downloader.js'
import { writeManifest } from '../images/manifest.js'
import type { Product } from '../types/product.js'

const PREFLIGHT_CONCURRENCY = 15
const DOWNLOAD_CONCURRENCY = 10

const scriptDir = dirname(fileURLToPath(import.meta.url))
const baseCsvPath = resolve(scriptDir, '../../../data/base.csv')
const imagesDir = resolve(scriptDir, '../../../data/images')
const manifestPath = resolve(scriptDir, '../../../data/image-manifest.json')

async function main(): Promise<void> {
  console.log('=== Image Caching Pipeline ===')

  // 1. Parse base.csv
  const { products } = parseProductCSV(baseCsvPath)
  console.log(`Loaded ${products.length} products from base.csv`)

  // 2. Flatten all image URLs with sku and index
  const allUrls = products.flatMap((product) =>
    product.images.map((url, index) => ({
      url,
      sku: product.sku,
      index,
    }))
  )
  console.log(`Found ${allUrls.length} image URLs across ${products.length} products`)

  // 3. Run preflight checks
  console.log('\n--- Preflight Check ---')
  const preflightResults = await runPreflight(allUrls, PREFLIGHT_CONCURRENCY)

  const reachableCount = preflightResults.filter((e) => e.status === 'reachable').length
  const unreachableCount = preflightResults.filter((e) => e.status === 'unreachable').length
  console.log(`Preflight complete: ${reachableCount} reachable, ${unreachableCount} unreachable`)

  // 4. Download reachable images
  console.log('\n--- Downloading Images ---')
  const finalEntries = await downloadAllImages(preflightResults, imagesDir, DOWNLOAD_CONCURRENCY)

  // 5. Write manifest
  writeManifest(finalEntries, manifestPath)
  console.log(`\nManifest written to ${manifestPath}`)

  // 6. Update base.csv with image metadata
  const updatedProducts: Product[] = products.map((product) => {
    const productEntries = finalEntries.filter(
      (entry) =>
        entry.sku === product.sku &&
        entry.status === 'reachable' &&
        entry.localPath !== undefined
    )
    return {
      ...product,
      _has_images: productEntries.length > 0,
      _image_count: productEntries.length,
    }
  })

  writeProductCSV(updatedProducts, baseCsvPath)

  // 7. Log final summary
  const withImages = updatedProducts.filter((p) => p._has_images).length
  const textOnly = updatedProducts.filter((p) => !p._has_images).length
  const downloadedCount = finalEntries.filter((e) => e.localPath !== undefined).length

  console.log('\n=== Summary ===')
  console.log(`Cached ${downloadedCount} images. Updated base.csv with image metadata.`)
  console.log(`${withImages} products have images, ${textOnly} products are text-only.`)
}

main().catch((error) => {
  console.error('Image caching failed:', error)
  process.exit(1)
})

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { writeManifest, type ImageManifestEntry } from './manifest.js'
import { MAX_EDGE, JPEG_QUALITY } from './resizer.js'

interface NoImgProduct {
  readonly sku: string
  readonly imageLinks: readonly string[]
}

async function downloadAndResize(url: string, outputPath: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*',
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.log(`[noimg-cache] ${url}: HTTP ${response.status}`)
      return false
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    const resized = await sharp(buffer)
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()

    writeFileSync(outputPath, resized)
    return true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`[noimg-cache] ${url}: failed (${msg})`)
    return false
  }
}

export async function cacheNoImgImages(
  products: readonly NoImgProduct[],
  imagesDir: string,
  manifestPath: string,
): Promise<void> {
  mkdirSync(imagesDir, { recursive: true })

  const entries: ImageManifestEntry[] = []

  // Check existing manifest to skip already-cached images
  const existingPaths = new Set<string>()
  if (existsSync(manifestPath)) {
    try {
      const { readManifest } = await import('./manifest.js')
      const existing = readManifest(manifestPath)
      for (const entry of existing) {
        if (entry.status === 'reachable' && entry.localPath && existsSync(entry.localPath)) {
          existingPaths.add(entry.url)
          entries.push(entry)
        }
      }
    } catch {
      // Manifest corrupt — rebuild from scratch
    }
  }

  let downloaded = 0
  let skipped = 0
  let failed = 0

  for (const product of products) {
    const skuDir = resolve(imagesDir, product.sku)
    mkdirSync(skuDir, { recursive: true })

    for (let i = 0; i < product.imageLinks.length; i++) {
      const url = product.imageLinks[i]

      if (existingPaths.has(url)) {
        skipped++
        continue
      }

      const fileName = `${product.sku}_${i}.jpg`
      const localPath = resolve(skuDir, fileName)

      const ok = await downloadAndResize(url, localPath)

      entries.push({
        url,
        sku: product.sku,
        index: i,
        status: ok ? 'reachable' : 'unreachable',
        localPath: ok ? localPath : undefined,
        contentType: ok ? 'image/jpeg' : undefined,
      })

      if (ok) {
        downloaded++
      } else {
        failed++
      }
    }
  }

  writeManifest(entries, manifestPath)

  console.log(`[noimg-cache] Done: ${downloaded} downloaded, ${skipped} cached, ${failed} failed`)
  console.log(`[noimg-cache] Manifest: ${manifestPath}`)
}

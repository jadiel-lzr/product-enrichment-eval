import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { readManifest } from './manifest.js'
import type { ImageInput } from '../adapters/types.js'

export const MAX_EDGE = 1024
export const JPEG_QUALITY = 85

export async function prepareImageForLLM(
  localPath: string,
): Promise<ImageInput> {
  const inputBuffer = readFileSync(localPath)

  const resizedBuffer = await sharp(inputBuffer)
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return {
    data: resizedBuffer,
    mimeType: 'image/jpeg',
  }
}

export async function prepareProductImages(
  sku: string,
  manifestPath: string,
  _imagesDir: string,
): Promise<readonly ImageInput[]> {
  const manifest = readManifest(manifestPath)

  const reachableEntries = manifest.filter(
    (entry) =>
      entry.sku === sku &&
      entry.status === 'reachable' &&
      entry.localPath !== undefined,
  )

  if (reachableEntries.length === 0) {
    return []
  }

  const images = await Promise.all(
    reachableEntries.map((entry) => prepareImageForLLM(entry.localPath!)),
  )

  return images
}

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => {
  const mockSharp = vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('resized-image-data')),
  }))
  return { default: mockSharp }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(Buffer.from('raw-image-data')),
  }
})

vi.mock('../manifest.js', () => ({
  readManifest: vi.fn(),
}))

import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { readManifest } from '../manifest.js'
import { prepareImageForLLM, prepareProductImages, MAX_EDGE, JPEG_QUALITY } from '../resizer.js'

describe('prepareImageForLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resizes a buffer and returns { data: Buffer, mimeType: "image/jpeg" }', async () => {
    const result = await prepareImageForLLM('/path/to/image.jpg')

    expect(readFileSync).toHaveBeenCalledWith('/path/to/image.jpg')
    expect(sharp).toHaveBeenCalledWith(Buffer.from('raw-image-data'))

    const sharpInstance = (sharp as unknown as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(sharpInstance.resize).toHaveBeenCalledWith({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    expect(sharpInstance.jpeg).toHaveBeenCalledWith({ quality: JPEG_QUALITY })

    expect(result.data).toBeInstanceOf(Buffer)
    expect(result.mimeType).toBe('image/jpeg')
  })
})

describe('prepareProductImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads manifest for a SKU and returns array of ImageInput buffers', async () => {
    vi.mocked(readManifest).mockReturnValue([
      {
        url: 'https://example.com/img1.jpg',
        sku: 'SKU123',
        index: 0,
        status: 'reachable' as const,
        localPath: 'data/images/SKU123_0.jpg',
      },
      {
        url: 'https://example.com/img2.jpg',
        sku: 'SKU123',
        index: 1,
        status: 'reachable' as const,
        localPath: 'data/images/SKU123_1.jpg',
      },
      {
        url: 'https://example.com/other.jpg',
        sku: 'OTHER',
        index: 0,
        status: 'reachable' as const,
        localPath: 'data/images/OTHER_0.jpg',
      },
    ])

    const result = await prepareProductImages('SKU123', '/manifest.json', '/images')

    expect(readManifest).toHaveBeenCalledWith('/manifest.json')
    expect(result).toHaveLength(2)
    expect(result[0].data).toBeInstanceOf(Buffer)
    expect(result[0].mimeType).toBe('image/jpeg')
  })

  it('returns empty array for products with no reachable images in manifest', async () => {
    vi.mocked(readManifest).mockReturnValue([
      {
        url: 'https://example.com/img1.jpg',
        sku: 'SKU123',
        index: 0,
        status: 'unreachable' as const,
        error: 'Not found',
      },
      {
        url: 'https://example.com/other.jpg',
        sku: 'OTHER',
        index: 0,
        status: 'reachable' as const,
        localPath: 'data/images/OTHER_0.jpg',
      },
    ])

    const result = await prepareProductImages('SKU123', '/manifest.json', '/images')

    expect(result).toHaveLength(0)
  })
})

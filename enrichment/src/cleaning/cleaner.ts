import type { Product } from '../types/product.js'
import { filterTestProducts } from './filters.js'
import { normalizeProduct } from './normalizers.js'
import { generateCleaningReport, type CleaningReport } from './report.js'

export interface CleaningResult {
  readonly cleanedProducts: Product[]
  readonly report: CleaningReport
}

function computeMetadata(product: Product): Product {
  return {
    ...product,
    _missing_fields: product.errors.length,
    _has_images: false,
    _image_count: 0,
  }
}

export function cleanProducts(
  products: readonly Product[],
): CleaningResult {
  const { kept, removed } = filterTestProducts(products)

  const normalized = kept.map(normalizeProduct)

  const withMetadata = normalized.map(computeMetadata)

  const titlesTrimmed = kept.filter(
    (p) => p.title !== p.title.trim() || p.name !== p.name.trim(),
  ).length

  const report = generateCleaningReport({
    totalInput: products.length,
    totalOutput: withMetadata.length,
    removed,
    colorsNormalized: withMetadata.length,
    titlesTrimmed,
  })

  return {
    cleanedProducts: withMetadata,
    report,
  }
}

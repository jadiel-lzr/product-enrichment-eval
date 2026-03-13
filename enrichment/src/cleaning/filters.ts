import type { Product } from '../types/product.js'

const TEST_NAME_PATTERN = 'Prodotto Test'
const TEST_BRAND = 'Brand di prova'

export function isTestProduct(product: Product): boolean {
  return (
    product.name.includes(TEST_NAME_PATTERN) ||
    product.brand === TEST_BRAND
  )
}

interface FilterResult {
  readonly kept: Product[]
  readonly removed: ReadonlyArray<{ readonly sku: string; readonly reason: string }>
}

export function filterTestProducts(
  products: readonly Product[],
): FilterResult {
  const kept: Product[] = []
  const removed: Array<{ sku: string; reason: string }> = []

  for (const product of products) {
    if (product.name.includes(TEST_NAME_PATTERN)) {
      removed.push({
        sku: product.sku,
        reason: `Name contains "${TEST_NAME_PATTERN}"`,
      })
    } else if (product.brand === TEST_BRAND) {
      removed.push({
        sku: product.sku,
        reason: `Brand is "${TEST_BRAND}"`,
      })
    } else {
      kept.push(product)
    }
  }

  return { kept, removed }
}

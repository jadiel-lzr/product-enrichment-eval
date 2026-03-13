import type { Product } from '../types/product.js'

export function normalizeColor(product: Product): Product {
  return {
    ...product,
    color: product.color.toLowerCase().trim(),
  }
}

export function sanitizeTitle(product: Product): Product {
  return {
    ...product,
    title: product.title.trim(),
    name: product.name.trim(),
  }
}

export function normalizeProduct(product: Product): Product {
  return sanitizeTitle(normalizeColor(product))
}

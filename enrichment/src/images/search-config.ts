import type { Product } from '../types/product.js'

export const FEED_SUPPLIER_DOMAINS: Readonly<Record<string, string>> = {
  loschi: 'loschiboutique.com',
}

export const BRAND_DOMAINS: readonly string[] = [
  'etro.com',
  'dolcegabbana.com',
  'alexandermcqueen.com',
  'off---white.com',
  'versace.com',
  'dsquared2.com',
  // 'courreges.com', // Blocks Anthropic's crawler — causes 400 error
  'rabanne.com',
  // 'jilsander.com', // Blocks Anthropic's ClaudeBot crawler
  'albertaferretti.com',
  'slowear.com',
  'khaite.com',
  'palmangels.com',
  'minirodini.com',
  'ermannoscervino.com',
  'frame-store.com',
]

export const RETAILER_DOMAINS: readonly string[] = [
  'farfetch.com',
  'ssense.com',
  'net-a-porter.com',
  'mytheresa.com',
  'matchesfashion.com',
  'italist.com',
  'thedoublef.com',
  'giglio.com',
  'vitkac.com',
  'childrensalon.com',
  'childsplayclothing.com',
  'kidsatelier.com',
  'kids21.com',
  'luksusbaby.kr',
  'smoochiebaby.com',
]

export const ITALIAN_COLOR_MAP: Readonly<Record<string, string>> = {
  NERO: 'black',
  BIANCO: 'white',
  ROSSO: 'red',
  VERDE: 'green',
  AZZURRO: 'light blue',
  BLU: 'blue',
  GRIGIO: 'grey',
  BEIGE: 'beige',
  ORO: 'gold',
  AVORIO: 'ivory',
  MARRONE: 'brown',
}

export const BRAND_CORRECTIONS: Readonly<Record<string, string>> = {
  BURBURRY: 'Burberry',
}

export function translateColor(color: string): string {
  if (!color) return ''

  return color
    .split(/[/,]/)
    .map((part) => {
      const trimmed = part.trim().toUpperCase()
      return ITALIAN_COLOR_MAP[trimmed] ?? part.trim()
    })
    .join('/')
}

export function correctBrand(brand: string): string {
  const upper = brand.toUpperCase()
  return BRAND_CORRECTIONS[upper] ?? brand
}

export function getTier1Domains(product: Product): readonly string[] {
  const domains: string[] = [...BRAND_DOMAINS]

  const feedName = (product as Record<string, unknown>).feed_name
  if (typeof feedName === 'string' && feedName.trim().length > 0) {
    const supplierDomain = FEED_SUPPLIER_DOMAINS[feedName.trim().toLowerCase()]
    if (supplierDomain) {
      domains.unshift(supplierDomain)
    }
  }

  return domains
}

export function getTier2Domains(): readonly string[] {
  return RETAILER_DOMAINS
}

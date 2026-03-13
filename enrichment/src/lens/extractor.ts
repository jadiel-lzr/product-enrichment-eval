import type { Product } from '../types/product.js'
import {
  LensMatchSchema,
  STOCK_PHOTO_DOMAINS,
  MAX_LENS_SCRAPING_URLS,
  MAX_LENS_CONTEXT_LINES,
  type LensMatch,
} from './types.js'

type LensColumn = 'lens_all_matches' | 'lens_brand_matches'

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

function isStockPhotoDomain(match: LensMatch): boolean {
  const sourceLower = match.source.toLowerCase()
  const hostname = getHostname(match.link)

  return STOCK_PHOTO_DOMAINS.some(
    (domain) => sourceLower.includes(domain) || (hostname !== undefined && hostname.includes(domain)),
  )
}

function hasValidUrl(match: LensMatch): boolean {
  return getHostname(match.link) !== undefined
}

export function extractLensMatches(
  product: Product,
  column: LensColumn,
): readonly LensMatch[] {
  const raw = (product as Record<string, unknown>)[column]
  if (raw === undefined || raw === null || raw === '') {
    return []
  }

  const value = typeof raw === 'string' ? safeParse(raw) : raw
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => LensMatchSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data)
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function filterUsableMatches(
  matches: readonly LensMatch[],
): readonly LensMatch[] {
  return matches.filter((match) => hasValidUrl(match) && !isStockPhotoDomain(match))
}

export function extractBrandMatches(product: Product): readonly LensMatch[] {
  return filterUsableMatches(extractLensMatches(product, 'lens_brand_matches'))
}

export function extractAllMatches(product: Product): readonly LensMatch[] {
  return filterUsableMatches(extractLensMatches(product, 'lens_all_matches'))
}

export function getLensScrapingUrls(product: Product): readonly string[] {
  const brandUrls = extractBrandMatches(product).map((m) => m.link)
  const allUrls = extractAllMatches(product).map((m) => m.link)

  const seen = new Set<string>()
  const unique: string[] = []

  for (const url of [...brandUrls, ...allUrls]) {
    if (!seen.has(url) && unique.length < MAX_LENS_SCRAPING_URLS) {
      seen.add(url)
      unique.push(url)
    }
  }

  return unique
}

function formatMatchLine(match: LensMatch): string {
  const price =
    match.price !== null && match.price !== undefined && match.price !== ''
      ? ` ($${match.price})`
      : ''
  return `- "${match.title}" via ${match.source}${price}`
}

export function buildLensContextLines(product: Product): readonly string[] {
  const brandMatches = extractBrandMatches(product)
  const matches = brandMatches.length > 0 ? brandMatches : extractAllMatches(product)

  return matches.slice(0, MAX_LENS_CONTEXT_LINES).map(formatMatchLine)
}

import Firecrawl from '@mendable/firecrawl-js'
import { readFileSync, existsSync } from 'node:fs'
import type { Product } from '../types/product.js'
import type { EnrichedFields } from '../types/enriched.js'
import { EnrichedFieldsSchema } from '../types/enriched.js'
import type { EnrichmentAdapter, EnrichmentResult } from './types.js'
import { computeFillRate } from './types.js'
import { withRetry } from '../batch/retry.js'

const SEARCH_LIMIT = 3
const ADAPTER_NAME = 'firecrawl'

interface SerpApiUrlMap {
  readonly [sku: string]: readonly string[]
}

function loadSerpApiUrls(path: string): SerpApiUrlMap {
  try {
    if (!existsSync(path)) {
      console.warn(`[FireCrawl] SerpAPI URLs file not found at ${path}, proceeding without pre-discovered URLs`)
      return {}
    }
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as SerpApiUrlMap
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[FireCrawl] SerpAPI URLs file could not be loaded: ${message}, proceeding without pre-discovered URLs`)
    return {}
  }
}

function buildSearchQuery(product: Product): string {
  const parts = [product.brand, product.name, product.model].filter(Boolean)
  return parts.join(' ')
}

function buildGoogleShoppingQuery(product: Product): string {
  const parts = [product.brand, product.name, 'site:shopping.google.com'].filter(Boolean)
  return parts.join(' ')
}

/**
 * Parse markdown content from a scraped page to extract enrichment fields.
 * Uses regex patterns and heuristics to find product details in semi-structured markdown.
 */
export function parseMarkdownForFields(
  markdown: string,
  _product: Product,
): Partial<EnrichedFields> {
  if (!markdown || markdown.trim() === '') {
    return {}
  }

  const fields: Record<string, string | undefined> = {}

  // Extract description from first substantial paragraph (non-header, non-list)
  const paragraphs = markdown
    .split('\n\n')
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 30 &&
        !p.startsWith('#') &&
        !p.startsWith('-') &&
        !p.startsWith('*') &&
        !p.startsWith('|'),
    )

  if (paragraphs.length > 0) {
    fields.description_eng = paragraphs[0].slice(0, 500)
  }

  // Field extraction patterns: key-value patterns in markdown
  const patternMap: ReadonlyArray<{
    readonly field: string
    readonly patterns: readonly RegExp[]
  }> = [
    {
      field: 'season',
      patterns: [
        /\*?\*?Season\*?\*?:?\s*(.+)/i,
        /Season:\s*(.+)/i,
        /\b((?:FW|SS|AW|PF|RS)\d{2,4})\b/i,
      ],
    },
    {
      field: 'year',
      patterns: [
        /\*?\*?Year\*?\*?:?\s*(\d{4})/i,
        /Year:\s*(\d{4})/i,
      ],
    },
    {
      field: 'collection',
      patterns: [
        /\*?\*?Collection\*?\*?:?\s*(.+)/i,
        /Collection:\s*(.+)/i,
      ],
    },
    {
      field: 'gtin',
      patterns: [
        /\*?\*?GTIN\*?\*?:?\s*(\d{8,14})/i,
        /\*?\*?Barcode\*?\*?:?\s*(\d{8,14})/i,
        /\*?\*?EAN\*?\*?:?\s*(\d{8,14})/i,
        /\*?\*?UPC\*?\*?:?\s*(\d{8,14})/i,
      ],
    },
    {
      field: 'dimensions',
      patterns: [
        /\*?\*?Dimensions?\*?\*?:?\s*(.+)/i,
        /Dimensions?:\s*(.+)/i,
        /(\d+\s*x\s*\d+\s*x?\s*\d*\s*(?:cm|mm|in))/i,
      ],
    },
    {
      field: 'materials',
      patterns: [
        /\*?\*?Materials?\*?\*?:?\s*(.+)/i,
        /Materials?:\s*(.+)/i,
        /\*?\*?Composition\*?\*?:?\s*(.+)/i,
        /\*?\*?Fabric\*?\*?:?\s*(.+)/i,
      ],
    },
    {
      field: 'made_in',
      patterns: [
        /\*?\*?Made\s*in\*?\*?:?\s*(.+)/i,
        /Made\s*in:?\s*(.+)/i,
        /\*?\*?Country\s*of\s*origin\*?\*?:?\s*(.+)/i,
        /\*?\*?Origin\*?\*?:?\s*(.+)/i,
      ],
    },
    {
      field: 'weight',
      patterns: [
        /\*?\*?Weight\*?\*?:?\s*(.+)/i,
        /Weight:\s*(.+)/i,
        /(\d+(?:\.\d+)?\s*(?:kg|g|lb|oz))/i,
      ],
    },
  ]

  for (const { field, patterns } of patternMap) {
    for (const pattern of patterns) {
      const match = markdown.match(pattern)
      if (match?.[1]) {
        const value = match[1].trim().replace(/\*+/g, '').trim()
        if (value.length > 0) {
          fields[field] = value
          break
        }
      }
    }
  }

  return fields
}

function getMarkdownFromSearchResults(
  data: ReadonlyArray<{ readonly markdown?: string; readonly url?: string }>,
): string | undefined {
  for (const item of data) {
    if (item.markdown && item.markdown.trim().length > 0) {
      return item.markdown
    }
  }
  return undefined
}

function buildEnrichmentResult(
  fields: Partial<EnrichedFields>,
  status: 'success' | 'partial' | 'failed',
  error?: string,
): EnrichmentResult {
  const validated = EnrichedFieldsSchema.parse(fields)
  // Remove accuracy_score if it exists -- FireCrawl is not an LLM
  const { accuracy_score: _removed, ...fieldsWithoutScore } = validated
  const cleanFields = EnrichedFieldsSchema.parse(fieldsWithoutScore)
  const fillRate = computeFillRate(cleanFields)
  const enrichedFields = Object.entries(cleanFields)
    .filter(([_key, value]) => value !== undefined && value !== '')
    .map(([key]) => key)

  const finalStatus = fillRate === 0 ? 'failed' : fillRate === 1 ? 'success' : status

  return {
    fields: cleanFields,
    status: error ? 'failed' : finalStatus,
    fillRate: error ? 0 : fillRate,
    enrichedFields: error ? [] : enrichedFields,
    error,
  }
}

export function createFirecrawlAdapter(
  serpApiUrlsPath?: string,
): EnrichmentAdapter {
  const apiKey = process.env.FIRECRAWL_API_KEY ?? ''
  const client = new Firecrawl({ apiKey })
  const urlsPath = serpApiUrlsPath ?? 'data/serpapi-urls.json'
  const serpApiUrls = loadSerpApiUrls(urlsPath)

  return {
    name: ADAPTER_NAME,

    async enrich(
      product: Product,
      _images?: readonly import('./types.js').ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        // Step 1: Check SerpAPI URLs for direct scrape
        const serpUrls = serpApiUrls[product.sku]
        if (serpUrls && serpUrls.length > 0) {
          const scrapeResult = await withRetry(
            () =>
              client.scrape(serpUrls[0], { formats: ['markdown'] }),
            `firecrawl-scrape-serpapi:${product.sku}`,
          )

          if (scrapeResult?.markdown) {
            const fields = parseMarkdownForFields(
              scrapeResult.markdown,
              product,
            )
            return buildEnrichmentResult(fields, 'partial')
          }
        }

        // Step 2: Brand site search
        const query = buildSearchQuery(product)
        const searchResult = await withRetry(
          () =>
            client.search(query, {
              limit: SEARCH_LIMIT,
              scrapeOptions: { formats: ['markdown'] },
            }),
          `firecrawl-search:${product.sku}`,
        )

        const searchMarkdown = searchResult?.web
          ? getMarkdownFromSearchResults(searchResult.web as ReadonlyArray<{ markdown?: string; url?: string }>)
          : undefined

        if (searchMarkdown) {
          const fields = parseMarkdownForFields(searchMarkdown, product)
          return buildEnrichmentResult(fields, 'partial')
        }

        // Step 3: Google Shopping fallback
        const fallbackQuery = buildGoogleShoppingQuery(product)
        const fallbackResult = await withRetry(
          () =>
            client.search(fallbackQuery, {
              limit: SEARCH_LIMIT,
              scrapeOptions: { formats: ['markdown'] },
            }),
          `firecrawl-search-fallback:${product.sku}`,
        )

        const fallbackMarkdown = fallbackResult?.web
          ? getMarkdownFromSearchResults(fallbackResult.web as ReadonlyArray<{ markdown?: string; url?: string }>)
          : undefined

        if (fallbackMarkdown) {
          const fields = parseMarkdownForFields(fallbackMarkdown, product)
          return buildEnrichmentResult(fields, 'partial')
        }

        // No results from any source
        return buildEnrichmentResult({}, 'failed', 'No search results found from any source')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildEnrichmentResult({}, 'failed', message)
      }
    },
  }
}

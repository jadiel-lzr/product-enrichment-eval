import Firecrawl from '@mendable/firecrawl-js'
import type { Product } from '../types/product.js'
import {
  ENRICHMENT_TARGET_FIELDS,
  EnrichedFieldsSchema,
  type EnrichedFields,
} from '../types/enriched.js'
import type { EnrichmentAdapter, EnrichmentResult } from './types.js'
import { computeFillRate } from './types.js'
import { withRetry } from '../batch/retry.js'
import { getLensScrapingUrls } from '../lens/extractor.js'

const SEARCH_LIMIT = 3
const ADAPTER_NAME = 'firecrawl'
const GOOGLE_SHOPPING_HOST = 'shopping.google.com'

type TargetField = (typeof ENRICHMENT_TARGET_FIELDS)[number]

interface JsonSchemaProperty {
  readonly type: 'string'
  readonly description: string
}

interface JsonSchema {
  readonly type: 'object'
  readonly properties: Record<string, JsonSchemaProperty>
  readonly required: readonly string[]
  readonly additionalProperties: false
}

function buildSearchQuery(product: Product): string {
  const parts = [product.brand, product.name, product.model].filter(Boolean)
  return parts.join(' ')
}

function buildGoogleShoppingQuery(product: Product): string {
  const parts = [
    product.brand,
    product.name,
    'site:shopping.google.com',
  ].filter(Boolean)
  return parts.join(' ')
}

function getExistingString(
  product: Product,
  field: string,
): string | undefined {
  const value = (product as Record<string, unknown>)[field]
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function getExistingTargetValue(
  product: Product,
  field: TargetField,
): string | undefined {
  switch (field) {
    case 'description_eng':
      return getExistingString(product, 'description_eng')
    case 'season':
      return product.season.trim() || undefined
    case 'year':
      return product.year.trim() || undefined
    case 'collection':
      return product.collection.trim() || undefined
    case 'gtin': {
      const values = product.gtin
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
      return values.length > 0 ? values.join(', ') : undefined
    }
    case 'dimensions':
      return product.dimensions.trim() || undefined
    case 'made_in':
      return product.made_in.trim() || undefined
    case 'materials':
      return (
        getExistingString(product, 'materials') ??
        product.materials_original.trim() ??
        undefined
      )
    case 'weight':
      return getExistingString(product, 'weight')
    case 'color':
      return (
        getExistingString(product, 'color') ??
        (product.color_original.trim() || undefined)
      )
    case 'additional_info':
      return getExistingString(product, 'additional_info')
  }
}

export function getCurrentTargetFields(
  product: Product,
): Partial<EnrichedFields> {
  const fields: Partial<EnrichedFields> = {}

  for (const field of ENRICHMENT_TARGET_FIELDS) {
    const value = getExistingTargetValue(product, field)
    if (value !== undefined && value !== '') {
      fields[field] = value
    }
  }

  return fields
}

export function getMissingFields(
  product: Product,
): readonly TargetField[] {
  return ENRICHMENT_TARGET_FIELDS.filter(
    (field) => getExistingTargetValue(product, field) === undefined,
  )
}

export function buildJsonSchema(
  fields: readonly TargetField[],
): JsonSchema {
  const properties = Object.fromEntries(
    fields.map((field) => [
      field,
      {
        type: 'string' as const,
        description: `Populate ${field}. Return an empty string if the page does not provide a reliable value.`,
      },
    ]),
  )

  return {
    type: 'object',
    properties,
    required: [...fields],
    additionalProperties: false,
  }
}

export function buildScrapePrompt(
  product: Product,
  fields: readonly TargetField[],
): string {
  return `Extract only the requested missing product fields from this page.

Product:
- Brand: ${product.brand}
- Name: ${product.name}
- Model: ${product.model}
- Color: ${product.color}
- Category: ${product.category}
- Department: ${product.department}

Return JSON with exactly these keys:
${fields.map((field) => `- ${field}`).join('\n')}

Rules:
- Only use information that is explicitly present on the page.
- If a requested field is not available or not reliable, return an empty string.
- Do not add any extra keys.
- Do not include explanations or markdown.`
}

function extractUrl(candidate: unknown): string | undefined {
  if (
    candidate &&
    typeof candidate === 'object' &&
    'url' in candidate &&
    typeof candidate.url === 'string' &&
    candidate.url.trim().length > 0
  ) {
    return candidate.url
  }

  if (
    candidate &&
    typeof candidate === 'object' &&
    'metadata' in candidate &&
    candidate.metadata &&
    typeof candidate.metadata === 'object' &&
    'url' in candidate.metadata &&
    typeof candidate.metadata.url === 'string' &&
    candidate.metadata.url.trim().length > 0
  ) {
    return candidate.metadata.url
  }

  return undefined
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function normalizeBrand(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

export function pickSearchResultUrl(
  webResults: readonly unknown[] | undefined,
  product: Product,
): string | undefined {
  const candidates = (webResults ?? [])
    .map(extractUrl)
    .filter((value): value is string => value !== undefined && isValidUrl(value))

  if (candidates.length === 0) {
    return undefined
  }

  const brandToken = normalizeBrand(product.brand)
  const brandMatch = candidates.find((url) => {
    const hostname = getHostname(url)
    return hostname !== undefined && hostname.includes(brandToken)
  })

  if (brandMatch) {
    return brandMatch
  }

  const nonShopping = candidates.find((url) => {
    const hostname = getHostname(url)
    return hostname !== undefined && hostname !== GOOGLE_SHOPPING_HOST
  })

  return nonShopping ?? candidates[0]
}

function cleanScrapedFields(
  rawJson: unknown,
  requestedFields: readonly TargetField[],
): Partial<EnrichedFields> {
  const rawRecord =
    rawJson && typeof rawJson === 'object'
      ? (rawJson as Record<string, unknown>)
      : {}

  const picked = Object.fromEntries(
    requestedFields.map((field) => [
      field,
      typeof rawRecord[field] === 'string' ? rawRecord[field].trim() : '',
    ]),
  )

  const validated = EnrichedFieldsSchema.parse(picked)
  const cleanFields: Partial<EnrichedFields> = {}

  for (const field of requestedFields) {
    const value = validated[field]
    if (typeof value === 'string' && value.length > 0) {
      cleanFields[field] = value
    }
  }

  return cleanFields
}

function buildEnrichmentResult(
  product: Product,
  fields: Partial<EnrichedFields>,
  error?: string,
): EnrichmentResult {
  const existingFields = getCurrentTargetFields(product)
  const finalFields = EnrichedFieldsSchema.parse({
    ...existingFields,
    ...fields,
  })

  const fillRate = computeFillRate(finalFields)
  const enrichedFields = Object.entries(fields)
    .filter(([_key, value]) => value !== undefined && value !== '')
    .map(([key]) => key)

  const finalStatus =
    fillRate === 0 ? 'failed' : fillRate === 1 ? 'success' : 'partial'

  return {
    fields: EnrichedFieldsSchema.parse(fields),
    status: error ? 'failed' : finalStatus,
    fillRate,
    enrichedFields: error ? [] : enrichedFields,
    error,
  }
}

async function scrapeForMissingFields(
  client: Firecrawl,
  url: string,
  product: Product,
  missingFields: readonly TargetField[],
): Promise<EnrichmentResult> {
  const scrapeResult = await withRetry(
    () =>
      client.scrape(url, {
        formats: [
          {
            type: 'json',
            prompt: buildScrapePrompt(product, missingFields),
            schema: buildJsonSchema(missingFields),
          },
        ],
      }),
    `firecrawl-scrape:${product.sku}`,
  )

  if (!scrapeResult?.json) {
    return buildEnrichmentResult(
      product,
      {},
      'No structured JSON returned from scraped page',
    )
  }

  const cleanFields = cleanScrapedFields(scrapeResult.json, missingFields)
  return buildEnrichmentResult(product, cleanFields)
}

export function createFirecrawlAdapter(): EnrichmentAdapter {
  const apiKey = process.env.FIRECRAWL_API_KEY ?? ''
  const client = new Firecrawl({ apiKey })

  return {
    name: ADAPTER_NAME,

    async enrich(
      product: Product,
      _images?: readonly import('./types.js').ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const missingFields = getMissingFields(product)
        if (missingFields.length === 0) {
          return buildEnrichmentResult(product, {})
        }

        const lensUrls = getLensScrapingUrls(product)
        if (lensUrls.length > 0) {
          return await scrapeForMissingFields(
            client,
            lensUrls[0]!,
            product,
            missingFields,
          )
        }

        const query = buildSearchQuery(product)
        const searchResult = await withRetry(
          () =>
            client.search(query, {
              limit: SEARCH_LIMIT,
            }),
          `firecrawl-search:${product.sku}`,
        )

        const primaryUrl = pickSearchResultUrl(searchResult?.web, product)
        if (primaryUrl) {
          return await scrapeForMissingFields(
            client,
            primaryUrl,
            product,
            missingFields,
          )
        }

        const fallbackQuery = buildGoogleShoppingQuery(product)
        const fallbackResult = await withRetry(
          () =>
            client.search(fallbackQuery, {
              limit: SEARCH_LIMIT,
            }),
          `firecrawl-search-fallback:${product.sku}`,
        )

        const fallbackUrl = pickSearchResultUrl(fallbackResult?.web, product)
        if (fallbackUrl) {
          return await scrapeForMissingFields(
            client,
            fallbackUrl,
            product,
            missingFields,
          )
        }

        return buildEnrichmentResult(
          product,
          {},
          'No usable search results found from any source',
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildEnrichmentResult(product, {}, message)
      }
    },
  }
}

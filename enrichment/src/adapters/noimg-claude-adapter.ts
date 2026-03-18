import { zodToJsonSchema } from 'zod-to-json-schema'
import { ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'
import { NoImgEnrichedFieldsSchema } from '../types/noimg-enriched.js'
import { withRetry } from '../batch/retry.js'
import { computeFillRate, type EnrichmentAdapter, type EnrichmentResult } from './types.js'
import {
  buildOpenAIJsonSchemaResponseFormat,
  createLiteLLMClient,
  tryParseJsonContent,
} from './litellm.js'
import type { Product } from '../types/product.js'
import { getTier1Domains, getTier2Domains, translateColor, correctBrand } from '../images/search-config.js'

const DEFAULT_MODEL = 'anthropic/claude-opus-4-5-20251101'
const DEFAULT_SEARCH_MODEL = 'anthropic/claude-sonnet-4-6'
const MAX_TOKENS = 4096

// Simple schema for Pass 1: just find URLs + basic metadata
const SEARCH_RESULT_SCHEMA = {
  type: 'object' as const,
  properties: {
    product_page_url: { type: 'string' as const, description: 'The specific product page URL found' },
    title: { type: 'string' as const, description: 'Actual product name from the page' },
    description_eng: { type: 'string' as const, description: 'Product description, 2-3 sentences' },
    season: { type: 'string' as const },
    year: { type: 'string' as const },
    collection: { type: 'string' as const },
    gtin: { type: 'string' as const },
    dimensions: { type: 'string' as const },
    made_in: { type: 'string' as const },
    materials: { type: 'string' as const },
    weight: { type: 'string' as const },
    color: { type: 'string' as const, description: 'Clean English color name' },
    additional_info: { type: 'string' as const },
    accuracy_score: { type: 'integer' as const, minimum: 1, maximum: 10 },
    confidence_score: { type: 'string' as const, enum: ['high', 'medium', 'low', 'none'] },
  },
  required: ['product_page_url', 'confidence_score'] as const,
  additionalProperties: false,
}

// Full schema for final output
const NOIMG_JSON_SCHEMA = {
  ...zodToJsonSchema(NoImgEnrichedFieldsSchema) as Record<string, unknown>,
  additionalProperties: false,
}

interface WebSearchTool {
  readonly type: string
  readonly name: 'web_search'
  readonly max_uses: number
  readonly allowed_domains?: readonly string[]
}

interface SearchTier {
  readonly name: string
  readonly domains: readonly string[] | undefined
  readonly maxUses: number
}

function buildSearchTiers(product: Product): readonly SearchTier[] {
  return [
    {
      name: 'supplier+brand',
      domains: getTier1Domains(product),
      maxUses: 3,
    },
    {
      name: 'retailers',
      domains: getTier2Domains(),
      maxUses: 3,
    },
    {
      name: 'unrestricted',
      domains: undefined,
      maxUses: 5,
    },
  ]
}

function buildWebSearchTool(tier: SearchTier): WebSearchTool {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: tier.maxUses,
    ...(tier.domains ? { allowed_domains: tier.domains } : {}),
  }
}

function buildSearchPrompt(product: Product): string {
  const brand = correctBrand(product.brand)
  const code = product.model || product.code || ''
  const name = product.name || ''
  const colorEng = translateColor(product.color_original || product.color)
  const searchHint = [brand, code, name, colorEng].filter((p) => p.length > 0).join(' ')

  return `Find the product page for this luxury fashion item and extract product details.

## Product Identity
- **Brand:** ${brand}
- **Name:** ${name}
- **Code/Model:** ${code}
- **Color:** ${colorEng || product.color}
- **Category:** ${product.category}
- **SKU:** ${product.sku}

## Search Strategy
1. Search for: \`${searchHint}\`
2. If that fails, try: \`${brand} "${code}"\` or \`${brand} ${name} ${colorEng} buy\`
3. Find a **specific product page** (NOT a collection or category page)
4. Prefer official brand sites and major retailers (farfetch, ssense, mytheresa, net-a-porter)

## What to Return
Return a JSON object with:
- \`product_page_url\`: The specific product page URL you found. Empty string if not found.
- \`confidence_score\`: "high" (exact product match on official/major site), "medium" (likely match on secondary retailer), "low" (uncertain), "none" (not found)
- Fill in any product details you find: title, description_eng, season, year, collection, materials, made_in, color, dimensions, weight, gtin, additional_info, accuracy_score

Return ONLY valid JSON. No markdown, no explanation.`
}

async function extractImageFromPage(url: string): Promise<string | undefined> {
  if (!url || url.trim() === '') return undefined

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.log(`[image-extract] ${url}: HTTP ${response.status}`)
      return undefined
    }

    const html = await response.text()

    // Try og:image first (most reliable)
    const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i)
    if (ogMatch?.[1]) {
      const imgUrl = ogMatch[1]
      console.log(`[image-extract] ${url}: found og:image`)
      return imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl
    }

    // Try JSON-LD structured data
    const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        const jsonContent = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
        try {
          const data = JSON.parse(jsonContent)
          const image = data.image ?? data.thumbnailUrl
          if (typeof image === 'string' && image.length > 0) {
            console.log(`[image-extract] ${url}: found JSON-LD image`)
            return image.startsWith('//') ? `https:${image}` : image
          }
          if (Array.isArray(image) && image.length > 0) {
            const first = typeof image[0] === 'string' ? image[0] : image[0]?.url ?? image[0]?.contentUrl
            if (typeof first === 'string') {
              console.log(`[image-extract] ${url}: found JSON-LD image array`)
              return first.startsWith('//') ? `https:${first}` : first
            }
          }
        } catch {
          // Invalid JSON-LD, continue
        }
      }
    }

    console.log(`[image-extract] ${url}: no image found in HTML`)
    return undefined
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`[image-extract] ${url}: fetch failed (${msg})`)
    return undefined
  }
}

function determineStatus(enrichedFieldCount: number): 'success' | 'partial' | 'failed' {
  if (enrichedFieldCount === ENRICHMENT_TARGET_FIELDS.length) {
    return 'success'
  }
  if (enrichedFieldCount > 0) {
    return 'partial'
  }
  return 'failed'
}

function getEnrichedFieldNames(fields: Record<string, unknown>): readonly string[] {
  return ENRICHMENT_TARGET_FIELDS.filter((field) => {
    const value = fields[field]
    return value !== undefined && value !== ''
  })
}

/**
 * Normalize raw LLM response fields before Zod validation.
 * Handles common response quirks:
 * - additional_info as object → JSON string
 * - accuracy_score as string → number
 * - null values → undefined (so Zod .optional() works)
 */
function normalizeFields(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  // Stringify any object/array values in string fields
  for (const key of Object.keys(normalized)) {
    const value = normalized[key]
    if (value === null) {
      normalized[key] = undefined
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      normalized[key] = JSON.stringify(value)
    }
  }

  // Coerce accuracy_score to integer
  if (normalized.accuracy_score !== undefined) {
    const score = Number(normalized.accuracy_score)
    normalized.accuracy_score = Number.isFinite(score) ? Math.round(score) : undefined
  }

  return normalized
}

function buildResult(fields: Record<string, unknown>): EnrichmentResult {
  const parsed = NoImgEnrichedFieldsSchema.parse(normalizeFields(fields))
  const enrichedFields = getEnrichedFieldNames(parsed)
  const fillRate = computeFillRate(parsed)
  const status = determineStatus(enrichedFields.length)

  return {
    fields: parsed,
    status,
    fillRate,
    enrichedFields,
    accuracyScore: parsed.accuracy_score,
  }
}

function mergeResults(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous }

  for (const [key, value] of Object.entries(current)) {
    if (value !== undefined && value !== '') {
      merged[key] = value
    }
  }

  return merged
}

export function createNoImgClaudeAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('claude')
  const searchModel = process.env.NOIMG_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL

  return {
    name: 'noimg-claude',

    async enrich(product: Product): Promise<EnrichmentResult> {
      try {
        const searchPrompt = buildSearchPrompt(product)
        const tiers = buildSearchTiers(product)

        let bestFields: Record<string, unknown> = {}
        let productPageUrl = ''

        console.log(`[noimg-claude] ${product.sku}: search prompt:\n${searchPrompt}\n`)

        // --- Pass 1: Search for product page URL + metadata ---
        for (const tier of tiers) {
          const webSearchTool = buildWebSearchTool(tier)
          console.log(`[noimg-claude] ${product.sku} tier=${tier.name}: domains=${tier.domains ? tier.domains.join(',') : 'unrestricted'}, maxUses=${tier.maxUses}`)

          // No response_format — web_search + JSON schema combined triggers
          // "Schema is too complex" on Anthropic's API. We ask for JSON in
          // the prompt instead and parse it ourselves.
          const createParams = {
            model: searchModel,
            max_tokens: MAX_TOKENS,
            messages: [
              {
                role: 'user' as const,
                content: searchPrompt,
              },
            ],
            tools: [webSearchTool],
          }

          let response: { choices: readonly { message?: { content?: string | null } }[] }
          try {
            response = await withRetry(
              async () => {
                const completion = await client.chat.completions.create(
                  createParams as unknown as Parameters<typeof client.chat.completions.create>[0],
                )
                return completion as { choices: readonly { message?: { content?: string | null } }[] }
              },
              `noimg-claude-${tier.name}:${product.sku}`,
            )
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (msg.includes('not accessible to our user agent') || msg.includes('400')) {
              console.log(
                `[noimg-claude] ${product.sku} tier=${tier.name}: domain blocked, skipping`,
              )
              continue
            }
            throw error
          }

          const content = response.choices[0]?.message?.content
          if (!content) {
            console.log(
              `[noimg-claude] ${product.sku} tier=${tier.name}: no response`,
            )
            continue
          }

          console.log(`[noimg-claude] ${product.sku} tier=${tier.name}: raw response:\n${content}\n`)

          const parsed = tryParseJsonContent(content)
          if (!parsed) {
            console.log(
              `[noimg-claude] ${product.sku} tier=${tier.name}: failed to parse JSON`,
            )
            continue
          }

          // Extract product page URL before merging
          const foundUrl = typeof parsed.product_page_url === 'string' ? parsed.product_page_url.trim() : ''
          const confidence = typeof parsed.confidence_score === 'string' ? parsed.confidence_score : 'none'

          // Remove search-only fields before merging into enrichment fields
          const { product_page_url: _url, ...enrichmentFields } = parsed
          bestFields = mergeResults(bestFields, normalizeFields(enrichmentFields))

          if (foundUrl && confidence !== 'none') {
            productPageUrl = foundUrl
            bestFields.source_url = foundUrl
            console.log(
              `[noimg-claude] ${product.sku} tier=${tier.name}: found product page (${confidence})`,
            )
            break
          }

          console.log(
            `[noimg-claude] ${product.sku} tier=${tier.name}: no product page found, trying next tier`,
          )
        }

        // --- Pass 2: Fetch the product page and extract og:image ---
        // DISABLED FOR TESTING — enable when Pass 1 results are validated
        // if (productPageUrl) {
        //   console.log(
        //     `[noimg-claude] ${product.sku}: fetching image from ${productPageUrl}`,
        //   )
        //   const imageUrl = await extractImageFromPage(productPageUrl)
        //
        //   if (imageUrl) {
        //     bestFields.image_links = imageUrl
        //     console.log(
        //       `[noimg-claude] ${product.sku}: extracted image URL`,
        //     )
        //   } else {
        //     console.log(
        //       `[noimg-claude] ${product.sku}: no image extracted from page`,
        //     )
        //   }
        // }

        if (Object.keys(bestFields).length === 0) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'No usable response from any search tier',
          }
        }

        return buildResult(bestFields)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          fields: {},
          status: 'failed',
          fillRate: 0,
          enrichedFields: [],
          error: message,
        }
      }
    },
  }
}

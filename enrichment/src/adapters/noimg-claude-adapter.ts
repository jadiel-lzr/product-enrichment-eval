import { Firecrawl } from 'firecrawl'
import { ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'
import { NoImgEnrichedFieldsSchema } from '../types/noimg-enriched.js'
import { withRetry } from '../batch/retry.js'
import { computeFillRate, type EnrichmentAdapter, type EnrichmentResult } from './types.js'
import {
  createLiteLLMClient,
  tryParseJsonContent,
} from './litellm.js'
import type { Product } from '../types/product.js'
import { translateColor, correctBrand, BRAND_DOMAINS, FEED_SUPPLIER_DOMAINS } from '../images/search-config.js'

const DEFAULT_SEARCH_MODEL = 'anthropic/claude-sonnet-4-6'
const MAX_TOKENS = 4096

function buildSearchPrompt(product: Product): string {
  const brand = correctBrand(product.brand)
  const code = product.model || product.code || ''
  const name = product.name || ''
  const colorEng = translateColor(product.color_original || product.color)
  const feedName = (product as Record<string, unknown>).feed_name as string ?? ''

  const searchHint = [brand, `"${code}"`, name, colorEng].filter((p) => p.length > 0).join(' ')

  // Build supplier/brand site hints
  const siteHints: string[] = []
  const supplierDomain = FEED_SUPPLIER_DOMAINS[feedName.trim().toLowerCase()]
  if (supplierDomain) siteHints.push(supplierDomain)
  const brandDomain = BRAND_DOMAINS[product.brand.toUpperCase().trim()]
  if (brandDomain) siteHints.push(brandDomain)
  const siteNote = siteHints.length > 0
    ? `\nAlso try: ${siteHints.map((d) => `site:${d}`).join(' or ')}`
    : ''

  return `Find the specific product page URL for this fashion product.

Product: ${brand} "${name}" | Code: ${code} | Color: ${colorEng || product.color} | Category: ${product.category}

Search: ${searchHint}${siteNote}

RULES:
- Only return a URL for a specific product page (NOT a collection, category, or brand page)
- The page must have product images and details — an out-of-stock page with no images is NOT a match
- "high" = exact product code "${code}" in URL or page + exact color match + has product images
- "medium" = brand and product name match + close color (e.g. "dark brown" vs "brown") + has product images
- "none" = no match, wrong color entirely, or page has no product images/info
- If you find the right product but in a DIFFERENT COLOR (e.g. looking for black, found red), return "none"
- Do NOT guess or fabricate URLs — only return URLs from actual search results

Return ONLY JSON, no markdown, no explanation:
{"product_page_url": "...", "confidence_score": "high|medium|none", "match_reason": "brief explanation of why this is a match — what code/name/color matched"}`
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

const IMAGE_EXTRACT_MODEL = process.env.IMAGE_EXTRACT_MODEL ?? 'anthropic/claude-haiku-4-5-20251001'

function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 10) return false
  if (url.startsWith('data:')) return false
  if (!/^(https?:)?\/\//i.test(url)) return false
  if (/(logo|favicon|sprite|social_sharing|spinner|spin_|widget|icon)/i.test(url)) return false
  // Must look like an image file or CDN image URL
  if (!/\.(jpe?g|png|webp|avif|gif|svg)\b/i.test(url) && !/image/i.test(url)) return false
  return true
}

function extractRelevantHtml(html: string): string {
  const parts: string[] = []

  // Extract <head> content (og:image, meta tags)
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (headMatch?.[1]) parts.push(headMatch[1])

  // Extract JSON-LD blocks
  const jsonLdBlocks = html.match(/<script\s[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)
  if (jsonLdBlocks) parts.push(...jsonLdBlocks)

  // Extract first few image-related tags from body as fallback
  const imgTags = html.match(/<img\s[^>]*src=["'][^"']+["'][^>]*>/gi)
  if (imgTags) parts.push(...imgTags.slice(0, 10))

  const trimmed = parts.join('\n')
  // Cap at ~12k chars to stay well within token limits for haiku
  return trimmed.length > 12_000 ? trimmed.slice(0, 12_000) : trimmed
}

async function fetchHtml(url: string): Promise<string | undefined> {
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

  return response.text()
}

async function extractViaFirecrawl(url: string): Promise<string | undefined> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.log(`[image-extract] ${url}: no FIRECRAWL_API_KEY, skipping fallback`)
    return undefined
  }

  console.log(`[image-extract] ${url}: falling back to Firecrawl`)
  const client = new Firecrawl({ apiKey })
  const doc = await client.scrape(url, { formats: ['markdown', 'images'] })

  // Try images array first — pick first valid product image
  if (doc.images && doc.images.length > 0) {
    const productImage = doc.images.find((img) => isValidImageUrl(img))
    if (productImage) {
      const resolved = productImage.startsWith('//') ? `https:${productImage}` : productImage
      console.log(`[image-extract] ${url}: Firecrawl images array`)
      return resolved
    }
  }

  // Fall back to LLM on the markdown content
  if (doc.markdown && doc.markdown.trim().length > 0) {
    const trimmed = doc.markdown.length > 12_000 ? doc.markdown.slice(0, 12_000) : doc.markdown
    return extractImageViaLlm(url, trimmed, 'markdown')
  }

  console.log(`[image-extract] ${url}: Firecrawl returned no usable content`)
  return undefined
}

async function extractImageViaLlm(
  url: string,
  content: string,
  contentType: 'html' | 'markdown',
): Promise<string | undefined> {
  const client = createLiteLLMClient('claude')
  const completion = await client.chat.completions.create({
    model: IMAGE_EXTRACT_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Extract the primary product image URL from this product page ${contentType}.

Page URL: ${url}

Look for (in priority order):
1. og:image meta tag
2. JSON-LD structured data image field
3. Main product image (largest/first product photo, not icons or logos)

Rules:
- Return ONLY a valid absolute image URL, nothing else
- If the URL starts with "//" prefix it with "https:"
- If the URL is a relative path, combine it with the page domain
- If the image is a site logo or placeholder (not a product photo), return "none"
- If no product image is found, return "none"

${contentType === 'html' ? 'HTML' : 'Markdown'}:
${content}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''

  // Extract first URL from the response in case LLM was verbose
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i)
    ?? raw.match(/^\/\/[^\s"'<>]+/i)
  const result = urlMatch?.[0]

  if (!result || !isValidImageUrl(result)) {
    console.log(`[image-extract] ${url}: LLM found no image`)
    return undefined
  }

  const imageUrl = result.startsWith('//') ? `https:${result}` : result
  console.log(`[image-extract] ${url}: LLM extracted image`)
  return imageUrl
}

export async function extractImageFromPage(url: string): Promise<string | undefined> {
  if (!url || url.trim() === '') return undefined

  try {
    // Try direct fetch first
    const html = await fetchHtml(url)

    if (html) {
      const relevantHtml = extractRelevantHtml(html)
      if (relevantHtml.trim().length > 0) {
        const result = await extractImageViaLlm(url, relevantHtml, 'html')
        if (result) return result
      }
    }

    // Fall back to Firecrawl for 403/429/empty pages
    return await extractViaFirecrawl(url)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`[image-extract] ${url}: direct fetch failed (${msg}), trying Firecrawl`)

    try {
      return await extractViaFirecrawl(url)
    } catch (fcError) {
      const fcMsg = fcError instanceof Error ? fcError.message : String(fcError)
      console.log(`[image-extract] ${url}: Firecrawl also failed (${fcMsg})`)
      return undefined
    }
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

function normalizeFields(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw }

  for (const key of Object.keys(normalized)) {
    const value = normalized[key]
    if (value === null) {
      normalized[key] = undefined
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      normalized[key] = JSON.stringify(value)
    }
  }

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

export function createNoImgClaudeAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('claude')
  const searchModel = process.env.NOIMG_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL

  return {
    name: 'noimg-claude',

    async enrich(product: Product): Promise<EnrichmentResult> {
      try {
        const searchPrompt = buildSearchPrompt(product)

        console.log(`[noimg-claude] ${product.sku}: search prompt:\n${searchPrompt}\n`)

        // Single unrestricted web search — no domain restrictions
        const webSearchTool = {
          type: 'web_search_20250305',
          name: 'web_search' as const,
          max_uses: 5,
        }

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

        let enrichedFields: Record<string, unknown> = {}

        let response: { choices: readonly { message?: { content?: string | null } }[] }
        try {
          response = await withRetry(
            async () => {
              const completion = await client.chat.completions.create(
                createParams as unknown as Parameters<typeof client.chat.completions.create>[0],
              )
              return completion as { choices: readonly { message?: { content?: string | null } }[] }
            },
            `noimg-claude:${product.sku}`,
          )
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.log(`[noimg-claude] ${product.sku}: search failed: ${msg}`)
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: msg,
          }
        }

        const content = response.choices[0]?.message?.content
        if (!content) {
          console.log(`[noimg-claude] ${product.sku}: no response content`)
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Empty response from search',
          }
        }

        console.log(`[noimg-claude] ${product.sku}: raw response:\n${content}\n`)

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          console.log(`[noimg-claude] ${product.sku}: failed to parse JSON`)
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Failed to parse JSON from search response',
          }
        }

        const foundUrl = typeof parsed.product_page_url === 'string' ? parsed.product_page_url.trim() : ''
        const confidence = typeof parsed.confidence_score === 'string' ? parsed.confidence_score : 'none'
        const matchReason = typeof parsed.match_reason === 'string' ? parsed.match_reason : ''

        if (foundUrl && (confidence === 'high' || confidence === 'medium')) {
          const isLive = await verifyUrl(foundUrl)
          if (isLive) {
            enrichedFields.source_url = foundUrl
            enrichedFields.confidence_score = confidence
            enrichedFields.match_reason = matchReason
            console.log(`[noimg-claude] ${product.sku}: verified ${foundUrl} (${confidence}) — ${matchReason}`)
          } else {
            console.log(`[noimg-claude] ${product.sku}: URL returned non-200: ${foundUrl}`)
            enrichedFields.confidence_score = 'none'
            enrichedFields.match_reason = `URL returned non-200: ${foundUrl}`
          }
        } else {
          console.log(`[noimg-claude] ${product.sku}: no match (${confidence})${matchReason ? ` — ${matchReason}` : ''}`)
          enrichedFields.confidence_score = confidence
          if (matchReason) enrichedFields.match_reason = matchReason
        }

        // --- Pass 2: Fetch the product page and extract og:image ---
        // DISABLED FOR TESTING — enable when Pass 1 results are validated
        // if (enrichedFields.source_url) {
        //   const imageUrl = await extractImageFromPage(enrichedFields.source_url as string)
        //   if (imageUrl) {
        //     enrichedFields.image_links = imageUrl
        //     console.log(`[noimg-claude] ${product.sku}: extracted image URL`)
        //   }
        // }

        if (Object.keys(enrichedFields).length === 0) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'No usable response from search',
          }
        }

        return buildResult(enrichedFields)
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

import OpenAI from 'openai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Product } from '../types/product.js'
import { EnrichedFieldsSchema } from '../types/enriched.js'
import type { EnrichmentAdapter, EnrichmentResult } from './types.js'
import { computeFillRate } from './types.js'
import { buildEnrichmentPrompt } from '../prompts/enrichment-prompt.js'
import { withRetry } from '../batch/retry.js'

const ADAPTER_NAME = 'perplexity'
const DEFAULT_MODEL = 'sonar-pro'
const DEFAULT_PERPLEXITY_BASE_URL = 'https://api.perplexity.ai'

// Pre-compute JSON schema from Zod schema once
const enrichedJsonSchema = zodToJsonSchema(EnrichedFieldsSchema)

// Regex to extract JSON object from free-text response
const JSON_EXTRACT_PATTERN = /\{[\s\S]*\}/

function tryParseJson(content: string): Record<string, unknown> | undefined {
  // First attempt: direct JSON parse
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    // Fallback: extract JSON from free-text response
    const match = content.match(JSON_EXTRACT_PATTERN)
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        return undefined
      }
    }
    return undefined
  }
}

export function createPerplexityAdapter(): EnrichmentAdapter {
  const apiKey = process.env.PERPLEXITY_API_KEY ?? ''
  const baseURL = process.env.PERPLEXITY_BASE_URL ?? DEFAULT_PERPLEXITY_BASE_URL
  const client = new OpenAI({
    apiKey,
    baseURL,
  })
  const model = process.env.PERPLEXITY_MODEL ?? DEFAULT_MODEL

  return {
    name: ADAPTER_NAME,

    async enrich(
      product: Product,
      _images?: readonly import('./types.js').ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const response = await withRetry(
          () =>
            client.chat.completions.create({
              model,
              messages: [{ role: 'user', content: promptText }],
              response_format: {
                type: 'json_schema' as const,
                json_schema: {
                  name: 'enriched_product',
                  schema: enrichedJsonSchema,
                },
              },
            }),
          `perplexity-enrich:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Empty response from Perplexity API',
          }
        }

        const parsed = tryParseJson(content)
        if (!parsed) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Failed to parse JSON from Perplexity response',
          }
        }

        // Validate with Zod schema
        const validated = EnrichedFieldsSchema.parse(parsed)

        // Remove accuracy_score if present -- Perplexity is not a vision LLM
        const { accuracy_score: _removed, ...fieldsWithoutScore } = validated
        const cleanFields = EnrichedFieldsSchema.parse(fieldsWithoutScore)

        const fillRate = computeFillRate(cleanFields)
        const enrichedFields = Object.entries(cleanFields)
          .filter(([_key, value]) => value !== undefined && value !== '')
          .map(([key]) => key)

        const status = fillRate === 0 ? 'failed' : fillRate === 1 ? 'success' : 'partial'

        return {
          fields: cleanFields,
          status,
          fillRate,
          enrichedFields,
        }
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

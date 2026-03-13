import OpenAI from 'openai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Product } from '../types/product.js'
import { EnrichedFieldsSchema } from '../types/enriched.js'
import type { EnrichmentAdapter, EnrichmentResult } from './types.js'
import { computeFillRate } from './types.js'
import { buildEnrichmentPrompt } from '../prompts/enrichment-prompt.js'
import { withRetry } from '../batch/retry.js'
import {
  buildOpenAIJsonSchemaResponseFormat,
  createLiteLLMClient,
  shouldUseLiteLLM,
  tryParseJsonContent,
} from './litellm.js'

const ADAPTER_NAME = 'perplexity'
const DEFAULT_MODEL = 'sonar-pro'
const DEFAULT_PERPLEXITY_BASE_URL = 'https://api.perplexity.ai'

// Pre-compute JSON schema from Zod schema once
const enrichedJsonSchema = zodToJsonSchema(EnrichedFieldsSchema) as Record<string, unknown>

function buildPerplexityResult(parsed: Record<string, unknown>): EnrichmentResult {
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
}

function buildFailedResult(error: string): EnrichmentResult {
  return {
    fields: {},
    status: 'failed',
    fillRate: 0,
    enrichedFields: [],
    error,
  }
}

function createNativePerplexityAdapter(): EnrichmentAdapter {
  const apiKey = process.env.PERPLEXITY_API_KEY ?? ''
  const baseURL = process.env.PERPLEXITY_BASE_URL ?? DEFAULT_PERPLEXITY_BASE_URL
  const client = new OpenAI({ apiKey, baseURL })
  const model = process.env.PERPLEXITY_MODEL ?? DEFAULT_MODEL

  return {
    name: ADAPTER_NAME,

    async enrich(product: Product): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const response = await withRetry(
          () =>
            client.chat.completions.create({
              model,
              messages: [{ role: 'user', content: promptText }],
              response_format: buildOpenAIJsonSchemaResponseFormat(enrichedJsonSchema),
            }),
          `perplexity-enrich:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return buildFailedResult('Empty response from Perplexity API')
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return buildFailedResult('Failed to parse JSON from Perplexity response')
        }

        return buildPerplexityResult(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildFailedResult(message)
      }
    },
  }
}

function createLiteLLMPerplexityAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('perplexity')
  const model = process.env.PERPLEXITY_MODEL ?? DEFAULT_MODEL
  const responseFormat = buildOpenAIJsonSchemaResponseFormat(enrichedJsonSchema)

  return {
    name: ADAPTER_NAME,

    async enrich(product: Product): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const response = await withRetry(
          () =>
            client.chat.completions.create({
              model,
              messages: [{ role: 'user', content: promptText }],
              response_format: responseFormat,
            }),
          `perplexity-enrich:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return buildFailedResult('Empty response from Perplexity LiteLLM route')
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return buildFailedResult('Failed to parse JSON from Perplexity LiteLLM response')
        }

        return buildPerplexityResult(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildFailedResult(message)
      }
    },
  }
}

export function createPerplexityAdapter(): EnrichmentAdapter {
  return shouldUseLiteLLM('perplexity')
    ? createLiteLLMPerplexityAdapter()
    : createNativePerplexityAdapter()
}

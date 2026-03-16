import OpenAI from 'openai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Product } from '../types/product.js'
import { EnrichedFieldsSchema } from '../types/enriched.js'
import type { EnrichmentAdapter, EnrichmentResult, ImageInput } from './types.js'
import { computeFillRate } from './types.js'
import { buildEnrichmentPrompt } from '../prompts/enrichment-prompt.js'
import { withRetry } from '../batch/retry.js'
import {
  buildOpenAIContentParts,
  buildOpenAIJsonSchemaResponseFormat,
  createLiteLLMClient,
  shouldUseLiteLLM,
  tryParseJsonContent,
} from './litellm.js'

const ADAPTER_NAME = 'gpt'
const DEFAULT_MODEL = 'gpt-5.2'
const DEFAULT_GPT_BASE_URL = 'https://api.openai.com/v1'

const enrichedJsonSchema = zodToJsonSchema(EnrichedFieldsSchema) as Record<string, unknown>

function buildGptResult(parsed: Record<string, unknown>): EnrichmentResult {
  const validated = EnrichedFieldsSchema.parse(parsed)

  const fillRate = computeFillRate(validated)
  const enrichedFields = Object.entries(validated)
    .filter(([_key, value]) => value !== undefined && value !== '')
    .map(([key]) => key)

  const status = fillRate === 0 ? 'failed' : fillRate === 1 ? 'success' : 'partial'

  return {
    fields: validated,
    status,
    fillRate,
    enrichedFields,
    accuracyScore: validated.accuracy_score,
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

function createNativeGptAdapter(): EnrichmentAdapter {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const baseURL = process.env.GPT_BASE_URL ?? DEFAULT_GPT_BASE_URL
  const client = new OpenAI({ apiKey, baseURL })
  const model = process.env.GPT_MODEL ?? DEFAULT_MODEL

  return {
    name: ADAPTER_NAME,

    async enrich(
      product: Product,
      images?: readonly ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const response = await withRetry(
          () =>
            client.chat.completions.create({
              model,
              messages: [
                {
                  role: 'user',
                  content: buildOpenAIContentParts(promptText, images),
                },
              ],
              response_format: buildOpenAIJsonSchemaResponseFormat(enrichedJsonSchema),
            }),
          `gpt-enrich:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return buildFailedResult('Empty response from GPT API')
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return buildFailedResult('Failed to parse JSON from GPT response')
        }

        return buildGptResult(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildFailedResult(message)
      }
    },
  }
}

function createLiteLLMGptAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('gpt')
  const model = process.env.GPT_MODEL ?? DEFAULT_MODEL
  const responseFormat = buildOpenAIJsonSchemaResponseFormat(enrichedJsonSchema)

  return {
    name: ADAPTER_NAME,

    async enrich(
      product: Product,
      images?: readonly ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const response = await withRetry(
          () =>
            client.chat.completions.create({
              model,
              messages: [
                {
                  role: 'user',
                  content: buildOpenAIContentParts(promptText, images),
                },
              ],
              response_format: responseFormat,
            }),
          `gpt-enrich:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return buildFailedResult('Empty response from GPT LiteLLM route')
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return buildFailedResult('Failed to parse JSON from GPT LiteLLM response')
        }

        return buildGptResult(parsed)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return buildFailedResult(message)
      }
    },
  }
}

export function createGptAdapter(): EnrichmentAdapter {
  return shouldUseLiteLLM('gpt')
    ? createLiteLLMGptAdapter()
    : createNativeGptAdapter()
}

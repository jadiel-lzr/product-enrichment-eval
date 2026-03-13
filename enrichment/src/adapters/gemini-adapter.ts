import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { EnrichedFieldsSchema, ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'
import { buildEnrichmentPrompt } from '../prompts/enrichment-prompt.js'
import { withRetry } from '../batch/retry.js'
import { computeFillRate, type EnrichmentAdapter, type EnrichmentResult, type ImageInput } from './types.js'
import {
  buildOpenAIContentParts,
  buildOpenAIJsonSchemaResponseFormat,
  createLiteLLMClient,
  shouldUseLiteLLM,
  tryParseJsonContent,
} from './litellm.js'
import type { Product } from '../types/product.js'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const ENRICHED_JSON_SCHEMA = zodToJsonSchema(EnrichedFieldsSchema)

interface InlineDataPart {
  readonly inlineData: {
    readonly mimeType: string
    readonly data: string
  }
}

interface TextPart {
  readonly text: string
}

type ContentPart = InlineDataPart | TextPart

function buildInlineDataParts(images: readonly ImageInput[]): readonly InlineDataPart[] {
  return images.map((image) => ({
    inlineData: {
      mimeType: image.mimeType,
      data: image.data.toString('base64'),
    },
  }))
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

function buildResult(fields: Record<string, unknown>): EnrichmentResult {
  const parsed = EnrichedFieldsSchema.parse(fields)
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

function createNativeGeminiAdapter(): EnrichmentAdapter {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || ''
  const ai = new GoogleGenAI({ apiKey })
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL

  return {
    name: 'gemini',

    async enrich(
      product: Product,
      images?: readonly ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const contents: ContentPart[] =
          images && images.length > 0
            ? [...buildInlineDataParts(images), { text: promptText }]
            : [{ text: promptText }]

        const response = await withRetry(
          () =>
            ai.models.generateContent({
              model,
              contents,
              config: {
                responseMimeType: 'application/json',
                responseJsonSchema: ENRICHED_JSON_SCHEMA,
              },
            }),
          `gemini:${product.sku}`,
        )

        const responseText = response.text
        if (!responseText) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Empty response from Gemini',
          }
        }

        return buildResult(JSON.parse(responseText) as Record<string, unknown>)
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

function createLiteLLMGeminiAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('gemini')
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const responseFormat = buildOpenAIJsonSchemaResponseFormat(
    ENRICHED_JSON_SCHEMA as Record<string, unknown>,
  )

  return {
    name: 'gemini',

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
          `gemini:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Empty response from Gemini LiteLLM route',
          }
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Failed to parse JSON from Gemini LiteLLM response',
          }
        }

        return buildResult(parsed)
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

export function createGeminiAdapter(): EnrichmentAdapter {
  return shouldUseLiteLLM('gemini')
    ? createLiteLLMGeminiAdapter()
    : createNativeGeminiAdapter()
}

import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { EnrichedFieldsSchema, ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'
import { buildEnrichmentPrompt } from '../prompts/enrichment-prompt.js'
import { withRetry } from '../batch/retry.js'
import { computeFillRate, type EnrichmentAdapter, type EnrichmentResult, type ImageInput } from './types.js'
import type { Product } from '../types/product.js'

const DEFAULT_MODEL = 'gemini-2.5-flash'

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

export function createGeminiAdapter(): EnrichmentAdapter {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY ?? ''
  const ai = new GoogleGenAI({ apiKey })
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const jsonSchema = zodToJsonSchema(EnrichedFieldsSchema)

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
                responseJsonSchema: jsonSchema,
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

        const parsed = EnrichedFieldsSchema.parse(JSON.parse(responseText))
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

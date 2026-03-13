import Anthropic from '@anthropic-ai/sdk'
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

const DEFAULT_MODEL = 'claude-haiku-4-5-20250415'
const MAX_TOKENS = 2048
const ENRICHED_JSON_SCHEMA = zodToJsonSchema(EnrichedFieldsSchema) as Record<string, unknown>

function buildJsonSchemaFormat(): { type: 'json_schema'; schema: Record<string, unknown> } {
  return {
    type: 'json_schema' as const,
    schema: ENRICHED_JSON_SCHEMA,
  }
}

function buildImageBlocks(images: readonly ImageInput[]): readonly Anthropic.ImageBlockParam[] {
  return images.map((image) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
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

function createNativeClaudeAdapter(): EnrichmentAdapter {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || null,
  })
  const model = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL
  const outputFormat = buildJsonSchemaFormat()

  return {
    name: 'claude',

    async enrich(
      product: Product,
      images?: readonly ImageInput[],
    ): Promise<EnrichmentResult> {
      try {
        const promptText = buildEnrichmentPrompt(product)

        const contentBlocks: Anthropic.ContentBlockParam[] =
          images && images.length > 0
            ? [...buildImageBlocks(images), { type: 'text' as const, text: promptText }]
            : [{ type: 'text' as const, text: promptText }]

        const response = await withRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: MAX_TOKENS,
              messages: [{ role: 'user', content: contentBlocks }],
              output_config: { format: outputFormat },
            }),
          `claude:${product.sku}`,
        )

        // Extract JSON from response text block
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        )

        if (!textBlock) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'No text block in Claude response',
          }
        }

        return buildResult(JSON.parse(textBlock.text) as Record<string, unknown>)
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

function createLiteLLMClaudeAdapter(): EnrichmentAdapter {
  const client = createLiteLLMClient('claude')
  const model = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL
  const responseFormat = buildOpenAIJsonSchemaResponseFormat(ENRICHED_JSON_SCHEMA)

  return {
    name: 'claude',

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
              max_tokens: MAX_TOKENS,
              messages: [
                {
                  role: 'user',
                  content: buildOpenAIContentParts(promptText, images),
                },
              ],
              response_format: responseFormat,
            }),
          `claude:${product.sku}`,
        )

        const content = response.choices[0]?.message?.content
        if (!content) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Empty response from Claude LiteLLM route',
          }
        }

        const parsed = tryParseJsonContent(content)
        if (!parsed) {
          return {
            fields: {},
            status: 'failed',
            fillRate: 0,
            enrichedFields: [],
            error: 'Failed to parse JSON from Claude LiteLLM response',
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

export function createClaudeAdapter(): EnrichmentAdapter {
  return shouldUseLiteLLM('claude')
    ? createLiteLLMClaudeAdapter()
    : createNativeClaudeAdapter()
}

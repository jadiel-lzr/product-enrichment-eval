import OpenAI from 'openai'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions/completions'
import type { ImageInput } from './types.js'

const JSON_EXTRACT_PATTERN = /\{[\s\S]*\}/

type LiteLLMTool = 'claude' | 'gemini' | 'perplexity'

function getFirstNonEmptyEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim() !== '') {
      return value
    }
  }

  return ''
}

export function resolveLiteLLMBaseUrl(tool: LiteLLMTool): string | undefined {
  const value = process.env[`${tool.toUpperCase()}_BASE_URL`] ?? process.env.LITELLM_BASE_URL
  if (!value || value.trim() === '') {
    return undefined
  }

  return value
}

export function shouldUseLiteLLM(tool: LiteLLMTool): boolean {
  return resolveLiteLLMBaseUrl(tool) !== undefined
}

export function createLiteLLMClient(tool: LiteLLMTool): OpenAI {
  const apiKeyEnvKeysByTool: Record<LiteLLMTool, readonly string[]> = {
    claude: ['CLAUDE_API_KEY', 'LITELLM_API_KEY', 'ANTHROPIC_API_KEY'],
    gemini: ['GEMINI_API_KEY', 'LITELLM_API_KEY', 'GOOGLE_GENAI_API_KEY'],
    perplexity: ['PERPLEXITY_API_KEY', 'LITELLM_API_KEY'],
  }
  const apiKeyEnvKeys = apiKeyEnvKeysByTool[tool]

  return new OpenAI({
    apiKey: getFirstNonEmptyEnv(apiKeyEnvKeys),
    baseURL: resolveLiteLLMBaseUrl(tool),
  })
}

export function buildOpenAIContentParts(
  promptText: string,
  images?: readonly ImageInput[],
): ChatCompletionContentPart[] {
  const imageParts =
    images?.map((image) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
      },
    })) ?? []

  return [...imageParts, { type: 'text' as const, text: promptText }]
}

export function buildOpenAIJsonSchemaResponseFormat(schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'enriched_product',
      schema,
    },
  }
}

export function tryParseJsonContent(content: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    const match = content.match(JSON_EXTRACT_PATTERN)
    if (!match) {
      return undefined
    }

    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
}

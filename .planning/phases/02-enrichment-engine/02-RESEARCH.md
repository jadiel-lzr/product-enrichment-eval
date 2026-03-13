# Phase 2: Enrichment Engine - Research

**Researched:** 2026-03-13
**Domain:** Multi-tool product enrichment (LLM APIs, web scraping, batch processing)
**Confidence:** HIGH

## Summary

Phase 2 builds four enrichment adapters (Claude, Gemini, FireCrawl, Perplexity) behind a shared `EnrichmentAdapter` interface, a resilient batch runner with checkpoint/resume, and CSV output with enrichment metadata. The core technical challenge is managing four fundamentally different APIs (two vision-capable LLMs, one web scraper, one search-augmented LLM) through a uniform interface while handling rate limits, failures, and partial results across ~498 products.

All four SDKs are well-documented and actively maintained. Claude and Gemini both support structured JSON output natively (Claude via `output_config` with Zod schemas, Gemini via `responseJsonSchema`), which eliminates fragile JSON parsing. FireCrawl provides search+scrape in one call. Perplexity works through the OpenAI SDK with a custom `baseURL`. The project already has p-limit installed for concurrency, Zod for schema validation, and PapaParse for CSV I/O -- the existing foundation is solid.

**Primary recommendation:** Use each SDK's native structured output mode to guarantee valid JSON responses. Implement checkpoint/resume via a per-tool JSON checkpoint file tracking completed SKUs. Use sharp for image resizing to 1024px longest edge before base64 encoding.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Field-dependent confidence strategy: Conservative for factual fields (GTIN, dimensions, year, weight), Aggressive for generative fields (description_eng, season, collection, materials, made_in)
- Description tone: luxury e-commerce copy, 2-3 sentences, professional style (NET-A-PORTER / SSENSE)
- Target ALL enrichment fields per product (not just missing ones), include existing values as context
- LLM adapters output per-product accuracy score (1-10 integer)
- Expanded enrichment fields: original 6 + `made_in`, `materials_original`, `weight` = 9 fields, plus allow LLMs to fill any other relevant fields
- EnrichedFields Zod schema must be updated to include the 3 new fields
- Send ALL cached images per product (1-3 images, 990 total), resize to max 1024px longest edge
- Text-only fallback for 1 product without images
- Images converted to base64 on-demand when building LLM requests
- FireCrawl: brand site first, then Google Shopping fallback; use SerpAPI URLs when available
- Perplexity: structured query with product identifiers, same output format as LLM adapters
- CLI flag: `--tool claude|gemini|firecrawl|perplexity|all`; tools process sequentially when "all"
- Concurrency within a tool: use p-limit
- Retry 2x with backoff: wait 2s, retry; wait 5s, retry; then mark failed
- Fill rate as numeric percentage (0.0-1.0)
- Enrichment metadata per product: `_enrichment_tool`, `_enrichment_status`, `_enrichment_fill_rate`, `_enriched_fields`, `_enrichment_error`, `_enrichment_accuracy_score`

### Claude's Discretion
- Exact concurrency limits per tool (p-limit value)
- Checkpoint file format and resume logic implementation
- Prompt template exact wording (following the decisions above)
- Search query construction details for FireCrawl
- Rate limit detection and throttling logic
- Image resize implementation approach
- Progress logging format and verbosity

### Deferred Ideas (OUT OF SCOPE)
- Remove client manual scoring from UI (UI-06, UI-07) -- replaced with LLM accuracy scores
- LLM score aggregation in dashboard -- Phase 4 should use LLM accuracy scores
- Non-LLM tool scoring asymmetry -- Phase 4 concern
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENRC-01 | Claude adapter enriches products using Anthropic Messages API with vision | Anthropic SDK `@anthropic-ai/sdk` with `messages.parse()` + Zod structured output + base64 image blocks |
| ENRC-02 | Gemini adapter enriches products using Google GenAI API with vision | `@google/genai` SDK with `generateContent()` + `responseJsonSchema` + inline image data |
| ENRC-03 | FireCrawl adapter enriches products by searching brand sites + Google Shopping | `@mendable/firecrawl-js` SDK with `search()` + `scrape()` methods, markdown parsing |
| ENRC-04 | Perplexity adapter enriches products using search-augmented LLM | `openai` SDK with `baseURL: "https://api.perplexity.ai"`, `sonar-pro` model, structured output via `response_format` |
| ENRC-05 | All adapters implement shared interface and fill same target fields | TypeScript `EnrichmentAdapter` interface with `enrich(product, images?) => EnrichmentResult` |
| ENRC-06 | LLM adapters include product images when available | sharp for resize to 1024px, base64 encoding via `fs.readFileSync` + `Buffer.toString('base64')` |
| PIPE-03 | System runs each product through each adapter and outputs enriched CSV | Batch runner with p-limit concurrency, CSV writer from Phase 1 |
| PIPE-04 | System supports checkpoint/resume for crash recovery | Per-tool JSON checkpoint file tracking completed SKUs + status |
| PIPE-05 | System tracks enrichment metadata per product | Metadata columns: `_enrichment_tool`, `_enrichment_status`, `_enrichment_fill_rate`, `_enriched_fields`, `_enrichment_error`, `_enrichment_accuracy_score` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.78.0 | Claude Messages API with vision + structured output | Official Anthropic SDK, native Zod schema support via `zodOutputFormat` |
| `@google/genai` | ^1.45.0 | Gemini API with vision + structured output | Official Google GenAI SDK (replaces deprecated `@google/generative-ai`) |
| `@mendable/firecrawl-js` | ^4.15.0 | Web search + scraping | Official FireCrawl SDK, search and scrape in one package |
| `openai` | ^6.27.0 | Perplexity API client (OpenAI-compatible) | Official OpenAI SDK, Perplexity uses OpenAI-compatible endpoint |
| `sharp` | ^0.33.0 | Image resize to 1024px before base64 encoding | Fastest Node.js image processor, handles JPEG/PNG/WebP natively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.25.76 | Schema validation for enrichment results | Already installed. Defines EnrichedFields schema, validates LLM outputs |
| `zod-to-json-schema` | ^3.25.1 | Convert Zod schemas to JSON Schema for Gemini | Gemini requires JSON Schema in `responseJsonSchema` config field |
| `p-limit` | ^7.3.0 | Concurrency control per tool | Already installed. Limits concurrent API calls to respect rate limits |
| `papaparse` | ^5.5.3 | CSV read/write | Already installed. Phase 1 CSV reader/writer reused directly |
| `tsx` | ^4.21.0 | TypeScript CLI execution | Already installed. Runs batch CLI scripts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sharp` | Built-in Canvas API | sharp is 10x faster, no browser dependency, handles buffer I/O natively |
| `zod-to-json-schema` | Manual JSON schema | zod-to-json-schema keeps single source of truth; note: will be replaced by Zod v4 native `z.toJSONSchema()` |
| `openai` SDK for Perplexity | `node-fetch` with manual requests | OpenAI SDK handles retries, typing, and streaming; minimal overhead |
| Individual tool SDKs | Vercel AI SDK (`ai`) | Extra abstraction layer; we need precise control over each API's unique features |

**Installation:**
```bash
cd enrichment && npm install @anthropic-ai/sdk @google/genai @mendable/firecrawl-js openai sharp zod-to-json-schema && npm install -D @types/sharp
```

## Architecture Patterns

### Recommended Project Structure
```
enrichment/src/
  adapters/
    types.ts              # EnrichmentAdapter interface, EnrichmentResult type
    claude-adapter.ts     # Claude implementation
    gemini-adapter.ts     # Gemini implementation
    firecrawl-adapter.ts  # FireCrawl implementation
    perplexity-adapter.ts # Perplexity implementation
    __tests__/
      claude-adapter.test.ts
      gemini-adapter.test.ts
      firecrawl-adapter.test.ts
      perplexity-adapter.test.ts
  batch/
    runner.ts             # Batch processing loop with checkpoint/resume
    checkpoint.ts         # Checkpoint file read/write/resume logic
    report.ts             # Run summary report generation
    __tests__/
      runner.test.ts
      checkpoint.test.ts
  images/                 # (existing)
    resizer.ts            # Image resize to 1024px + base64 encoding
    downloader.ts         # (existing)
    manifest.ts           # (existing)
    preflight.ts          # (existing)
  prompts/
    enrichment-prompt.ts  # Shared prompt template for LLM adapters
  types/
    enriched.ts           # (existing, needs expansion to 9+ fields)
    product.ts            # (existing)
    index.ts              # (existing, re-exports)
  scripts/
    enrich.ts             # CLI entry point: --tool flag, orchestration
    parse-and-clean.ts    # (existing)
    cache-images.ts       # (existing)
```

### Pattern 1: Adapter Interface
**What:** Shared interface that all 4 adapters implement
**When to use:** Every adapter must conform to this contract
**Example:**
```typescript
// Source: Project architecture decision
import type { Product } from '../types/product.js'

export interface EnrichmentResult {
  readonly fields: Record<string, string | undefined>
  readonly status: 'success' | 'partial' | 'failed'
  readonly fillRate: number          // 0.0 - 1.0
  readonly enrichedFields: string[]  // field names that were filled
  readonly accuracyScore?: number    // 1-10, LLM adapters only
  readonly error?: string
}

export interface EnrichmentAdapter {
  readonly name: string  // 'claude' | 'gemini' | 'firecrawl' | 'perplexity'
  enrich(product: Product, imageBuffers?: ReadonlyArray<{data: Buffer; mimeType: string}>): Promise<EnrichmentResult>
}
```

### Pattern 2: Checkpoint/Resume via JSON File
**What:** Per-tool checkpoint file tracks completed SKUs so batch can resume after crash
**When to use:** Every batch run reads checkpoint on start, writes after each product
**Example:**
```typescript
// Source: Standard batch processing pattern
interface CheckpointData {
  readonly tool: string
  readonly startedAt: string
  readonly lastUpdatedAt: string
  readonly completedSkus: ReadonlyArray<string>
  readonly results: ReadonlyArray<{
    readonly sku: string
    readonly status: 'success' | 'partial' | 'failed'
  }>
}

// Checkpoint file: data/checkpoints/checkpoint-{tool}.json
// On start: load checkpoint, filter out already-completed SKUs
// After each product: append to checkpoint file (atomic write via writeFileSync to temp + rename)
```

### Pattern 3: Claude Structured Output with Vision
**What:** Use `messages.parse()` with `zodOutputFormat` for guaranteed JSON + base64 images
**When to use:** Claude adapter
**Example:**
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const response = await client.messages.parse({
  model: 'claude-haiku-4-5-20250415',
  max_tokens: 2048,
  messages: [{
    role: 'user',
    content: [
      // Images first, then text (Anthropic recommends images before text)
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
      { type: 'text', text: promptText }
    ]
  }],
  output_config: { format: zodOutputFormat(EnrichedFieldsSchema) }
})

const enrichedFields = response.parsed_output // Typed, validated
```

### Pattern 4: Gemini Structured Output with Vision
**What:** Use `generateContent()` with `responseJsonSchema` + inline image data
**When to use:** Gemini adapter
**Example:**
```typescript
// Source: https://ai.google.dev/gemini-api/docs/structured-output
import { GoogleGenAI } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [
    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
    { text: promptText }
  ],
  config: {
    responseMimeType: 'application/json',
    responseJsonSchema: zodToJsonSchema(EnrichedFieldsSchema)
  }
})

const enrichedFields = EnrichedFieldsSchema.parse(JSON.parse(response.text))
```

### Pattern 5: Perplexity via OpenAI SDK
**What:** Use OpenAI SDK with Perplexity baseURL for search-augmented enrichment
**When to use:** Perplexity adapter
**Example:**
```typescript
// Source: https://docs.perplexity.ai/guides/chat-completions-guide
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
})

const response = await client.chat.completions.create({
  model: 'sonar-pro',
  messages: [{ role: 'user', content: promptText }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'enriched_product',
      schema: zodToJsonSchema(EnrichedFieldsSchema)
    }
  }
})

const enrichedFields = EnrichedFieldsSchema.parse(
  JSON.parse(response.choices[0].message.content ?? '{}')
)
```

### Pattern 6: FireCrawl Search + Scrape
**What:** Search for product on brand site / Google Shopping, then scrape results as markdown
**When to use:** FireCrawl adapter
**Example:**
```typescript
// Source: https://docs.firecrawl.dev/introduction
import Firecrawl from '@mendable/firecrawl-js'

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })

// Option A: SerpAPI URL exists -- skip search, scrape directly
// Option B: No SerpAPI URL -- search first
const searchResults = await firecrawl.search(`${brand} ${name} ${model}`, {
  limit: 3,
  scrapeOptions: { formats: ['markdown'] }
})

// Parse markdown content to extract enrichment fields
// Falls back to Google Shopping: `${brand} ${name} site:shopping.google.com`
```

### Anti-Patterns to Avoid
- **Shared mutable state between adapters:** Each adapter call must be stateless; share nothing between product enrichments except read-only config
- **Parsing JSON from free-text LLM output:** Use structured output modes (Claude `output_config`, Gemini `responseJsonSchema`, Perplexity `response_format`) -- never regex-parse JSON from prose
- **Loading all images into memory at once:** Base64 encode on-demand per product, not all 990 images upfront
- **Writing checkpoint only at end of batch:** Write after EVERY product completion; crashing after 400 products with no checkpoint wastes all API credits
- **Retrying without backoff:** Anthropic and Google will throttle aggressively; always use exponential backoff

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image resizing | Manual pixel manipulation or Canvas | `sharp` | Handles ICC profiles, EXIF rotation, memory-mapped I/O; 10x faster than alternatives |
| JSON schema validation | Manual `typeof` checks on LLM output | `zod.parse()` on structured output | Edge cases: missing fields, wrong types, extra properties. Zod catches all of them |
| HTTP retries with backoff | Custom retry loop with setTimeout | SDK built-in retries + custom wrapper with 2s/5s delays | Each SDK has its own retry logic; layer project-specific 2x retry on top |
| CSV serialization of JSON columns | String concatenation | Existing `csv-writer.ts` + `json-columns.ts` | Already handles JSON column round-trip correctly from Phase 1 |
| Concurrent request limiting | Manual Promise.all batching | `p-limit` (already installed) | Handles edge cases like queue draining, error propagation |
| Zod-to-JSON-Schema conversion | Hand-written JSON schemas | `zod-to-json-schema` | Single source of truth; Zod schema drives both validation and API schema |

**Key insight:** The four APIs each have unique structured output mechanisms. Using native structured output from each SDK eliminates the most common failure mode in LLM integrations: malformed JSON responses.

## Common Pitfalls

### Pitfall 1: Base64 Image Size Explosion
**What goes wrong:** Sending full-resolution images as base64 inflates request payload to 5-10MB per product (3 images x 1-3MB each), hitting API size limits and burning tokens on image processing
**Why it happens:** Raw cached images are full resolution from source URLs
**How to avoid:** Resize ALL images to max 1024px longest edge with `sharp` before base64 encoding. Use `sharp(buffer).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()`
**Warning signs:** API errors about request size, unexpectedly high token usage, slow request times

### Pitfall 2: Checkpoint File Corruption on Crash
**What goes wrong:** Process crashes mid-write to checkpoint file, leaving it truncated/invalid JSON; next run fails to parse checkpoint and either crashes or restarts from scratch
**Why it happens:** `writeFileSync` is not atomic -- kernel can flush partial data
**How to avoid:** Write to a temp file first, then `renameSync` (atomic on most filesystems). Pattern: `writeFileSync('checkpoint-tool.tmp', data)` then `renameSync('checkpoint-tool.tmp', 'checkpoint-tool.json')`
**Warning signs:** Corrupt JSON in checkpoint files after kill -9

### Pitfall 3: Rate Limit Cascading Failures
**What goes wrong:** Hitting rate limit on one product triggers retries that also hit rate limits, creating a cascade where the entire batch stalls
**Why it happens:** Multiple concurrent requests hit the rate limit simultaneously; all retry at the same time
**How to avoid:** Add jitter to retry delays. When a 429 is detected, pause ALL concurrent requests (not just the one that failed). Use `Retry-After` header value when present. Recommended concurrency limits: Claude=3, Gemini=5, FireCrawl=2, Perplexity=3
**Warning signs:** Burst of 429 errors followed by more 429s during retry

### Pitfall 4: Perplexity Schema Cold Start
**What goes wrong:** First request with a new JSON schema takes 10-30 seconds and may timeout
**Why it happens:** Perplexity compiles/caches schemas server-side on first use
**How to avoid:** Set a longer timeout for the first request (60s vs 30s default). Alternatively, send a single warm-up request before starting the batch
**Warning signs:** First product in Perplexity batch always times out

### Pitfall 5: FireCrawl Search Returning Irrelevant Results
**What goes wrong:** Search query `{brand} {name} {model}` returns generic brand pages or unrelated products, leading to garbage enrichment
**Why it happens:** Product names in the dataset may be generic or missing; brand sites may not index by model number
**How to avoid:** Use SerpAPI-discovered URLs when available (skip search entirely). For search: try brand site first, then Google Shopping fallback. Validate search results by checking if product identifiers appear in the returned content
**Warning signs:** Enriched descriptions that don't match the product at all

### Pitfall 6: LLM Hallucinating GTINs and Dimensions
**What goes wrong:** LLM generates plausible-looking but completely fabricated GTIN barcodes or dimension values
**Why it happens:** GTINs and dimensions are factual data that LLMs cannot infer from images or descriptions
**How to avoid:** CONTEXT decision: conservative strategy for factual fields -- instruct LLM to leave blank if uncertain. Validate GTIN format (13 or 14 digits, check digit valid) post-enrichment
**Warning signs:** All products getting different GTINs than their existing values, dimensions that don't match product type

### Pitfall 7: Memory Pressure from Image Buffers
**What goes wrong:** With concurrency=5 and 3 images per product, 15 image buffers (each ~500KB-2MB after resize) sit in memory simultaneously
**Why it happens:** p-limit allows N concurrent enrichments, each holding image buffers
**How to avoid:** Load and encode images inside the adapter call (not pre-loaded). Let garbage collection reclaim buffers after each enrichment. Monitor with `process.memoryUsage()` if needed. Keep concurrency at 3-5 for LLM adapters
**Warning signs:** Node.js heap growing steadily, eventual OOM crash

## Code Examples

### Image Resize + Base64 Encoding
```typescript
// Source: https://sharp.pixelplumbing.com/api-resize
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const MAX_EDGE = 1024
const JPEG_QUALITY = 85

export async function prepareImageForLLM(
  localPath: string
): Promise<{ data: string; mimeType: string }> {
  const inputBuffer = readFileSync(localPath)

  const resizedBuffer = await sharp(inputBuffer)
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return {
    data: resizedBuffer.toString('base64'),
    mimeType: 'image/jpeg',
  }
}
```

### Atomic Checkpoint Write
```typescript
import { writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs'

interface CheckpointData {
  readonly tool: string
  readonly startedAt: string
  readonly lastUpdatedAt: string
  readonly completed: ReadonlyArray<{
    readonly sku: string
    readonly status: 'success' | 'partial' | 'failed'
  }>
}

export function writeCheckpoint(
  path: string,
  data: CheckpointData,
): void {
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, path)
}

export function loadCheckpoint(path: string): CheckpointData | undefined {
  if (!existsSync(path)) return undefined
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as CheckpointData
  } catch {
    return undefined  // Corrupt file -- start fresh
  }
}

export function getCompletedSkus(checkpoint: CheckpointData | undefined): ReadonlySet<string> {
  if (!checkpoint) return new Set()
  return new Set(checkpoint.completed.map(c => c.sku))
}
```

### Retry with Backoff
```typescript
const RETRY_DELAYS = [2000, 5000] as const  // 2s, 5s per CONTEXT decision

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt]
        console.warn(`[Retry] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
```

### Enrichment Metadata Columns
```typescript
// Metadata columns added to each product row in the enriched CSV
export interface EnrichmentMetadata {
  readonly _enrichment_tool: string           // 'claude' | 'gemini' | 'firecrawl' | 'perplexity'
  readonly _enrichment_status: string         // 'success' | 'partial' | 'failed'
  readonly _enrichment_fill_rate: number      // 0.0 - 1.0 (e.g., 0.67 = 6/9 fields)
  readonly _enriched_fields: string           // Comma-separated: "description_eng,season,year"
  readonly _enrichment_error: string          // Error message if failed, empty otherwise
  readonly _enrichment_accuracy_score: string // 1-10 for LLM adapters, empty for non-LLM
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` | `@google/genai` | Nov 2025 deprecated | Must use new SDK; old one permanently unsupported after Nov 2025 |
| Claude tool_use hack for JSON | `output_config` structured output | Nov 2025 (beta) | Guaranteed valid JSON, no parsing errors, native Zod support |
| Perplexity custom HTTP | `openai` SDK with custom baseURL | Stable 2025+ | Full type safety, retry logic, streaming support built-in |
| Gemini text-based JSON | `responseJsonSchema` in config | 2025 | Guaranteed schema compliance, combined with vision in same call |
| Manual JSON extraction from LLM prose | Native structured output (all 3 LLMs) | 2025 | Eliminates #1 failure mode in LLM-based data extraction pipelines |

**Deprecated/outdated:**
- `@google/generative-ai`: Permanently end-of-life Nov 30, 2025. Use `@google/genai` instead
- Claude `output_format` parameter: Replaced by `output_config` (transition period active, use `output_config`)

## Open Questions

1. **Exact Gemini model name for production use**
   - What we know: `gemini-2.5-flash` is well-supported and cost-effective; `gemini-3-flash-preview` is newer but in preview
   - What's unclear: Whether preview models have different rate limits or reliability
   - Recommendation: Use `gemini-2.5-flash` for stability; planner can choose based on cost preference

2. **Claude model choice: Haiku vs Sonnet**
   - What we know: Haiku 4.5 is ~3x cheaper than Sonnet 4.5 with 90% capability. For 498 products with images, cost difference is significant
   - What's unclear: Whether Haiku's vision capabilities are sufficient for luxury product enrichment
   - Recommendation: Default to `claude-haiku-4-5-20250415` for cost efficiency; make model configurable via env var so user can switch to Sonnet if quality is insufficient

3. **Perplexity structured output reliability**
   - What we know: STATE.md flags "Perplexity adapter structured output reliability needs empirical validation"
   - What's unclear: Whether `response_format` with `json_schema` consistently returns valid JSON for complex product schemas
   - Recommendation: Implement with structured output, but add a JSON.parse fallback: if structured output fails, try extracting JSON from free-text response

4. **FireCrawl credit consumption for 498 products**
   - What we know: Each search uses credits; each scrape uses credits. 498 products x (1 search + 1-3 scrapes) could be 1000-2000 credits
   - What's unclear: Exact credit cost per operation on current plan
   - Recommendation: Log credit usage from API response (`creditsUsed` field). Consider running a 10-product pilot first

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `enrichment/vitest.config.ts` |
| Quick run command | `cd enrichment && npx vitest run --reporter=verbose` |
| Full suite command | `cd enrichment && npx vitest run --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENRC-01 | Claude adapter produces EnrichmentResult from product + images | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/claude-adapter.test.ts -x` | Wave 0 |
| ENRC-02 | Gemini adapter produces EnrichmentResult from product + images | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/gemini-adapter.test.ts -x` | Wave 0 |
| ENRC-03 | FireCrawl adapter produces EnrichmentResult from search+scrape | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/firecrawl-adapter.test.ts -x` | Wave 0 |
| ENRC-04 | Perplexity adapter produces EnrichmentResult from chat completion | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/perplexity-adapter.test.ts -x` | Wave 0 |
| ENRC-05 | All adapters implement EnrichmentAdapter interface correctly | unit | `cd enrichment && npx vitest run src/adapters/__tests__/ -x` | Wave 0 |
| ENRC-06 | LLM adapters include images in API calls when available | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/claude-adapter.test.ts -x` | Wave 0 |
| PIPE-03 | Batch runner processes all products and writes enriched CSV | integration | `cd enrichment && npx vitest run src/batch/__tests__/runner.test.ts -x` | Wave 0 |
| PIPE-04 | Checkpoint/resume skips already-completed products | unit | `cd enrichment && npx vitest run src/batch/__tests__/checkpoint.test.ts -x` | Wave 0 |
| PIPE-05 | Enrichment metadata columns populated correctly | unit | `cd enrichment && npx vitest run src/batch/__tests__/runner.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd enrichment && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd enrichment && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `enrichment/src/adapters/__tests__/claude-adapter.test.ts` -- covers ENRC-01, ENRC-06
- [ ] `enrichment/src/adapters/__tests__/gemini-adapter.test.ts` -- covers ENRC-02, ENRC-06
- [ ] `enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts` -- covers ENRC-03
- [ ] `enrichment/src/adapters/__tests__/perplexity-adapter.test.ts` -- covers ENRC-04
- [ ] `enrichment/src/batch/__tests__/runner.test.ts` -- covers PIPE-03, PIPE-05
- [ ] `enrichment/src/batch/__tests__/checkpoint.test.ts` -- covers PIPE-04
- [ ] `enrichment/src/images/__tests__/resizer.test.ts` -- covers image resize logic

## Sources

### Primary (HIGH confidence)
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- base64 image format, content block structure, size limits (5MB/image, 1568px resize threshold)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- `output_config` + `zodOutputFormat`, `messages.parse()` method, supported models
- [Google GenAI Vision Docs](https://ai.google.dev/gemini-api/docs/vision?lang=node) -- `@google/genai` SDK, inline image data, 20MB request limit
- [Google Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) -- `responseJsonSchema` config, `responseMimeType`, Zod-to-JSON-Schema usage
- [FireCrawl Docs](https://docs.firecrawl.dev/introduction) -- `@mendable/firecrawl-js` SDK, search and scrape API methods
- [Perplexity Structured Outputs](https://docs.perplexity.ai/guides/structured-outputs) -- `response_format` with `json_schema`, cold start warning (10-30s)
- [Perplexity OpenAI Compatibility](https://docs.perplexity.ai/guides/chat-completions-guide) -- `openai` SDK with `baseURL`, `sonar-pro` model

### Secondary (MEDIUM confidence)
- [npm @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) -- version 0.78.0 (21 days ago)
- [npm @google/genai](https://www.npmjs.com/package/@google/genai) -- version 1.45.0 (recent)
- [npm @mendable/firecrawl-js](https://www.npmjs.com/package/@mendable/firecrawl-js) -- version 4.15.4 (5 days ago)
- [npm openai](https://www.npmjs.com/package/openai) -- version 6.27.0 (7 days ago)
- [sharp resize API](https://sharp.pixelplumbing.com/api-resize/) -- fit 'inside', withoutEnlargement option
- [Perplexity Pricing](https://docs.perplexity.ai/docs/getting-started/pricing) -- sonar $1/$1, sonar-pro $3/$15 per 1M tokens

### Tertiary (LOW confidence)
- Perplexity structured output reliability for complex schemas -- flagged in STATE.md, needs empirical validation
- Exact FireCrawl credit costs per search/scrape operation on current plan -- varies by plan tier
- Gemini free tier rate limits (10 RPM, 250 RPD for 2.5 Flash) -- frequently changed by Google, verify before batch run

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all SDKs verified from official npm and docs, actively maintained
- Architecture: HIGH -- patterns derived from official SDK documentation and established batch processing practices
- Pitfalls: HIGH -- documented in official docs (image size limits, schema cold start) and common engineering knowledge (checkpoint corruption, rate limit cascading)
- API structured output: MEDIUM -- Claude and Gemini structured output well-documented; Perplexity needs empirical validation

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (30 days -- SDKs are stable, APIs may receive minor updates)

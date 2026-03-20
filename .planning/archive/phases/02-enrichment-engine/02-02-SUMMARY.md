---
phase: 02-enrichment-engine
plan: 02
subsystem: enrichment
tags: [anthropic-sdk, google-genai, zod-to-json-schema, vision, structured-output, adapter-interface]

# Dependency graph
requires:
  - phase: 02-enrichment-engine
    provides: EnrichmentAdapter interface, EnrichedFieldsSchema, computeFillRate, buildEnrichmentPrompt, withRetry, ImageInput type
provides:
  - Claude vision adapter with base64 images and output_config structured output
  - Gemini vision adapter with inlineData images and responseJsonSchema structured output
  - Both adapters share same prompt template, image handling pattern, and accuracy scoring
affects: [02-04, 03-core-comparison-ui]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk", "@google/genai", zod-to-json-schema]
  patterns: [json-schema-output-config, inline-data-vision, factory-adapter-pattern]

key-files:
  created:
    - enrichment/src/adapters/claude-adapter.ts
    - enrichment/src/adapters/gemini-adapter.ts
    - enrichment/src/adapters/__tests__/claude-adapter.test.ts
    - enrichment/src/adapters/__tests__/gemini-adapter.test.ts
  modified:
    - enrichment/package.json

key-decisions:
  - "Used zod-to-json-schema instead of SDK zodOutputFormat because project is pinned to Zod v3.25 (SDK requires Zod v4 z.toJSONSchema)"
  - "Claude output_config uses manually built json_schema format object for Zod v3 compatibility"
  - "Gemini uses responseJsonSchema (plain JSON schema) rather than responseSchema (SDK Schema type)"

patterns-established:
  - "Factory adapter: createXAdapter() returns EnrichmentAdapter with immutable name and async enrich method"
  - "Vision content ordering: images before text for both Claude (base64 blocks) and Gemini (inlineData parts)"
  - "Structured output: both adapters use JSON schema-based structured output, validated post-response with EnrichedFieldsSchema.parse()"

requirements-completed: [ENRC-01, ENRC-02, ENRC-06]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 2 Plan 2: LLM Vision Adapters Summary

**Claude and Gemini vision adapters with base64/inlineData images, JSON schema structured output via zod-to-json-schema, accuracy scoring, and retry-wrapped API calls**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T18:01:32Z
- **Completed:** 2026-03-13T18:09:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Claude adapter sends base64 image blocks before text, uses output_config with json_schema format for structured output
- Gemini adapter sends inlineData image parts + text, uses responseJsonSchema with responseMimeType for structured JSON
- Both adapters validate responses with EnrichedFieldsSchema.parse(), compute fillRate, extract accuracyScore
- Both handle text-only products (no images) gracefully with text-only content blocks
- Both wrap API calls in withRetry for 2x backoff (2s, 5s delays)
- Both support model override via environment variables (CLAUDE_MODEL, GEMINI_MODEL)
- All 20 new tests pass (10 Claude + 10 Gemini), 164 total tests pass

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Claude adapter with vision and structured output** - `10694e0` (test), `eb96d93` (feat)
2. **Task 2: Gemini adapter with vision and structured output** - `2708618` (test), `783ed15` (feat)

_Note: TDD tasks have separate test and implementation commits_

## Files Created/Modified
- `enrichment/src/adapters/claude-adapter.ts` - Claude EnrichmentAdapter with base64 vision + output_config structured output
- `enrichment/src/adapters/gemini-adapter.ts` - Gemini EnrichmentAdapter with inlineData vision + responseJsonSchema structured output
- `enrichment/src/adapters/__tests__/claude-adapter.test.ts` - 10 test cases covering interface, vision, structured output, retry, model config
- `enrichment/src/adapters/__tests__/gemini-adapter.test.ts` - 10 test cases covering interface, vision, structured output, retry, model config
- `enrichment/package.json` - Added @anthropic-ai/sdk, @google/genai, zod-to-json-schema dependencies

## Decisions Made
- Used `zod-to-json-schema` instead of SDK's `zodOutputFormat` helper because the Anthropic SDK's `zodOutputFormat` calls `z.toJSONSchema()` which is a Zod v4 API, but the project is pinned to Zod v3.25. Building the `output_config` format object manually with `zod-to-json-schema` achieves the same result while maintaining Zod v3 compatibility.
- Gemini adapter uses `responseJsonSchema` (accepts plain JSON object) instead of `responseSchema` (accepts SDK Schema type), which aligns with `zod-to-json-schema` output format.
- Both adapters extract `response.text` as JSON string and validate with `EnrichedFieldsSchema.parse()` post-response rather than relying on SDK auto-parsing, ensuring consistent validation across both adapters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced zodOutputFormat with manual json_schema format via zod-to-json-schema**
- **Found during:** Task 1 (Claude adapter implementation)
- **Issue:** Anthropic SDK's `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` calls `z.toJSONSchema()` which is Zod v4 only; project is pinned to Zod v3.25
- **Fix:** Used `zod-to-json-schema` to convert EnrichedFieldsSchema to JSON Schema, then constructed the `output_config` format object manually with `{ type: 'json_schema', schema: jsonSchema }`
- **Files modified:** enrichment/src/adapters/claude-adapter.ts, enrichment/package.json
- **Verification:** All 10 Claude adapter tests pass
- **Committed in:** eb96d93 (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary because the SDK helper requires Zod v4. The manual approach achieves identical API behavior. No scope creep.

## Issues Encountered
- Anthropic SDK `zodOutputFormat` incompatible with Zod v3.25 -- resolved by using `zod-to-json-schema` for JSON schema conversion
- Pre-existing TypeScript errors in `firecrawl-adapter.ts` from a parallel plan -- logged to deferred-items.md, not in scope

## User Setup Required

None - API keys (ANTHROPIC_API_KEY, GOOGLE_GENAI_API_KEY) are read from environment at runtime. No configuration changes needed.

## Next Phase Readiness
- Both LLM vision adapters ready for the batch runner (Plan 04)
- Adapters share the same EnrichmentAdapter interface as FireCrawl and Perplexity (Plans 02-03)
- zod-to-json-schema now available for other adapters that need JSON schema conversion

## Self-Check: PASSED

- All 4 created files verified on disk
- All 4 commit hashes verified in git log (10694e0, eb96d93, 2708618, 783ed15)
- 20 new tests pass (10 Claude + 10 Gemini)
- No TypeScript errors in plan files

---
*Phase: 02-enrichment-engine*
*Completed: 2026-03-13*

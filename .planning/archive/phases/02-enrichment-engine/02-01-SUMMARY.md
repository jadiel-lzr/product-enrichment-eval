---
phase: 02-enrichment-engine
plan: 01
subsystem: enrichment
tags: [zod, sharp, image-resize, checkpoint, retry, prompt-template, adapter-interface]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: ProductSchema, EnrichedFieldsSchema, image manifest, CSV reader/writer
provides:
  - Expanded EnrichedFieldsSchema with 9 target fields + accuracy_score + passthrough
  - ENRICHMENT_TARGET_FIELDS constant for fill rate computation
  - EnrichmentAdapter interface and EnrichmentResult type
  - computeFillRate and buildEnrichmentMetadata utilities
  - Image resizer (sharp) for 1024px max edge JPEG
  - Checkpoint module with atomic write/read/resume
  - Retry utility with 2s/5s backoff
  - LLM prompt template with confidence strategy and luxury tone
affects: [02-02, 02-03, 02-04, 03-core-comparison-ui]

# Tech tracking
tech-stack:
  added: [sharp, "@types/sharp"]
  patterns: [adapter-interface, atomic-checkpoint, retry-with-backoff, prompt-template]

key-files:
  created:
    - enrichment/src/adapters/types.ts
    - enrichment/src/images/resizer.ts
    - enrichment/src/batch/checkpoint.ts
    - enrichment/src/batch/retry.ts
    - enrichment/src/prompts/enrichment-prompt.ts
    - enrichment/src/adapters/__tests__/types.test.ts
    - enrichment/src/images/__tests__/resizer.test.ts
    - enrichment/src/batch/__tests__/checkpoint.test.ts
    - enrichment/src/batch/__tests__/retry.test.ts
    - enrichment/src/prompts/__tests__/enrichment-prompt.test.ts
  modified:
    - enrichment/src/types/enriched.ts
    - enrichment/src/types/index.ts
    - enrichment/src/types/__tests__/product.test.ts
    - enrichment/package.json

key-decisions:
  - "Changed EnrichedFieldsSchema from .strict() to .passthrough() for hybrid LLM discovery approach"
  - "Image resizer returns Buffer (not base64) -- adapters handle encoding per API format"
  - "Retry tests use real timers to avoid fake timer unhandled rejection issues with Vitest 4"

patterns-established:
  - "Adapter interface: EnrichmentAdapter with enrich(product, images?) => EnrichmentResult"
  - "Atomic checkpoint: write to temp file + rename for crash-safe persistence"
  - "Retry with fixed backoff: 2s/5s delays per CONTEXT.md decision"
  - "Prompt template: field-dependent confidence (conservative factual, aggressive generative)"

requirements-completed: [ENRC-05, ENRC-06, PIPE-04, PIPE-05]

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 2 Plan 1: Shared Infrastructure Summary

**Expanded EnrichedFields (9 fields + accuracy_score), adapter interface, image resizer (sharp 1024px), checkpoint/resume, retry with 2s/5s backoff, and LLM prompt template with confidence strategy**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T17:51:29Z
- **Completed:** 2026-03-13T17:58:23Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- EnrichedFieldsSchema expanded to 9 target fields + accuracy_score with passthrough for LLM-discovered extras
- EnrichmentAdapter interface, EnrichmentResult, EnrichmentMetadata types, computeFillRate, and buildEnrichmentMetadata utilities
- Image resizer using sharp (1024px max edge, JPEG quality 85) with manifest-based product image loading
- Checkpoint module with atomic writes (temp + rename) for crash-safe batch processing
- Retry utility with configurable 2s/5s backoff delays (1 initial + 2 retries)
- LLM prompt template with field-dependent confidence strategy, luxury e-commerce tone, and JSON output format
- All 115 tests pass (84 existing + 31 new), tsc --noEmit clean

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Expand EnrichedFields schema and create adapter interface** - `52aceb7` (test), `e8ae85e` (feat)
2. **Task 2: Image resizer, checkpoint, retry, and prompt** - `82c7e43` (test), `cb02fc8` (feat)

_Note: TDD tasks have separate test and implementation commits_

## Files Created/Modified
- `enrichment/src/types/enriched.ts` - Expanded schema: 9 fields + accuracy_score + passthrough
- `enrichment/src/types/index.ts` - Re-exports ENRICHMENT_TARGET_FIELDS
- `enrichment/src/adapters/types.ts` - EnrichmentAdapter, EnrichmentResult, EnrichmentMetadata, computeFillRate, buildEnrichmentMetadata
- `enrichment/src/images/resizer.ts` - prepareImageForLLM (sharp resize), prepareProductImages (manifest-based)
- `enrichment/src/batch/checkpoint.ts` - writeCheckpoint (atomic), loadCheckpoint, getCompletedSkus
- `enrichment/src/batch/retry.ts` - withRetry with RETRY_DELAYS [2000, 5000]
- `enrichment/src/prompts/enrichment-prompt.ts` - buildEnrichmentPrompt with confidence strategy
- `enrichment/package.json` - Added sharp dependency

## Decisions Made
- Changed EnrichedFieldsSchema from `.strict()` to `.passthrough()` per CONTEXT.md hybrid approach -- allows LLMs to fill additional fields they discover beyond the 9 targets
- Image resizer returns `Buffer` (not base64 string) -- each adapter encodes differently per API format (Claude base64, Gemini inline, etc.)
- Retry tests use real timers instead of vi.useFakeTimers() -- Vitest 4 has unhandled rejection issues with fake timers and mockRejectedValue; real timers are more reliable (tests take ~14s but are correct)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing strict mode test to reflect passthrough behavior**
- **Found during:** Task 1 (Schema expansion)
- **Issue:** Existing test `rejects unknown fields (strict mode)` failed because schema intentionally changed from strict to passthrough
- **Fix:** Updated test to verify passthrough behavior instead of strict rejection
- **Files modified:** enrichment/src/types/__tests__/product.test.ts
- **Verification:** All 115 tests pass
- **Committed in:** e8ae85e (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed npm cache permissions for sharp install**
- **Found during:** Task 2 (sharp installation)
- **Issue:** npm cache had root-owned files preventing package install
- **Fix:** Used alternate cache directory (`--cache /tmp/npm-cache-fix`) to bypass permissions issue
- **Verification:** sharp installed successfully, all imports resolve
- **Committed in:** cb02fc8 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and build. No scope creep.

## Issues Encountered
- npm cache ownership prevented sharp install -- resolved by using alternate cache directory
- Vitest 4 fake timers create unhandled rejections with `mockRejectedValue` -- resolved by using real timers for retry tests

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All shared infrastructure ready for parallel adapter development in Wave 2
- EnrichmentAdapter interface and EnrichmentResult types available for Claude, Gemini, FireCrawl, and Perplexity adapters
- Image resizer, checkpoint module, retry utility, and prompt template tested and ready

---
*Phase: 02-enrichment-engine*
*Completed: 2026-03-13*

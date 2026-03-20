---
phase: 02-enrichment-engine
plan: 03
subsystem: enrichment
tags: [firecrawl, perplexity, openai-sdk, web-scraping, search-augmented-llm, markdown-parsing, zod-to-json-schema]

# Dependency graph
requires:
  - phase: 02-enrichment-engine
    provides: EnrichmentAdapter interface, EnrichmentResult type, computeFillRate, withRetry, buildEnrichmentPrompt, EnrichedFieldsSchema
provides:
  - FireCrawl adapter with search+scrape enrichment via @mendable/firecrawl-js
  - Perplexity adapter with search-augmented LLM enrichment via OpenAI SDK
  - parseMarkdownForFields helper for extracting enrichment data from web content
affects: [02-04, 03-core-comparison-ui]

# Tech tracking
tech-stack:
  added: ["@mendable/firecrawl-js", "openai", "zod-to-json-schema"]
  patterns: [markdown-field-extraction, json-parse-fallback, serpapi-url-bypass]

key-files:
  created:
    - enrichment/src/adapters/firecrawl-adapter.ts
    - enrichment/src/adapters/perplexity-adapter.ts
    - enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts
    - enrichment/src/adapters/__tests__/perplexity-adapter.test.ts
  modified:
    - enrichment/package.json

key-decisions:
  - "FireCrawl SDK uses scrape() method (not scrapeUrl) and SearchData.web property (not data)"
  - "Perplexity JSON parse fallback: regex extraction of JSON from free-text when structured output fails"
  - "Neither adapter includes accuracyScore -- non-LLM-vision tools do not self-assess accuracy"

patterns-established:
  - "Markdown field extraction: regex patterns for key-value pairs in semi-structured web content"
  - "SerpAPI URL bypass: skip search when pre-discovered URLs exist, scrape directly"
  - "JSON parse fallback: try direct parse, then regex extract from free-text"

requirements-completed: [ENRC-03, ENRC-04]

# Metrics
duration: 7min
completed: 2026-03-13
---

# Phase 2 Plan 3: FireCrawl and Perplexity Adapters Summary

**FireCrawl search+scrape adapter with SerpAPI URL bypass and markdown field extraction, Perplexity adapter with OpenAI SDK structured output and JSON parse fallback**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T18:01:32Z
- **Completed:** 2026-03-13T18:09:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- FireCrawl adapter: brand site search with Google Shopping fallback, SerpAPI URL direct scrape bypass, regex-based markdown field extraction for 9 target fields
- Perplexity adapter: OpenAI SDK with Perplexity baseURL, response_format json_schema via zod-to-json-schema, JSON parse fallback for unreliable structured output
- Both adapters implement EnrichmentAdapter interface, compute fillRate, exclude accuracyScore, wrap calls in withRetry
- All 63 adapter tests pass (types: 13, claude: 10, gemini: 10, firecrawl: 17, perplexity: 13)

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: FireCrawl adapter with search, scrape, and SerpAPI URL integration** - `b6158ca` (test), `70491b2` (feat), `e51346d` (SDK type fix)
2. **Task 2: Perplexity adapter with structured output via OpenAI SDK** - `9042102` (test), `e51346d` (feat)

_Note: TDD tasks have separate test and implementation commits. Task 2 feat commit also includes FireCrawl SDK type corrections._

## Files Created/Modified
- `enrichment/src/adapters/firecrawl-adapter.ts` - FireCrawl search+scrape adapter with SerpAPI URL bypass and markdown field extraction
- `enrichment/src/adapters/perplexity-adapter.ts` - Perplexity adapter using OpenAI SDK with structured output and JSON parse fallback
- `enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts` - 17 tests covering search strategy, field extraction, retry, and error handling
- `enrichment/src/adapters/__tests__/perplexity-adapter.test.ts` - 13 tests covering API config, structured output, model config, and JSON fallback
- `enrichment/package.json` - Added @mendable/firecrawl-js, openai, zod-to-json-schema dependencies

## Decisions Made
- FireCrawl SDK v4.15 uses `scrape()` method and returns `SearchData` with `web` array (not `data`). Updated implementation and tests to match actual SDK types.
- Perplexity JSON parse fallback implemented per research recommendation: when structured output fails, extract JSON object from free-text using regex. This addresses the documented reliability concern from STATE.md.
- Neither adapter includes accuracyScore since they are not LLM-vision tools doing self-assessment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FireCrawl SDK method names and return types**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan specified `scrapeUrl()` and `searchResult.data` but SDK v4.15 uses `scrape()` and `searchResult.web`
- **Fix:** Updated adapter to use correct SDK method `scrape()` and access `web` property on SearchData
- **Files modified:** enrichment/src/adapters/firecrawl-adapter.ts, enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts
- **Verification:** TypeScript compiles clean, all 17 firecrawl tests pass
- **Committed in:** e51346d

---

**Total deviations:** 1 auto-fixed (1 bug -- SDK API mismatch)
**Impact on plan:** Necessary correction for SDK compatibility. No scope creep.

## Issues Encountered
- Pre-existing claude-adapter.test.ts failure (`z.toJSONSchema is not a function`) from parallel Plan 02-02 -- unrelated to this plan, caused by Zod v3 not having `toJSONSchema`. Out of scope per deviation rules.
- Pre-existing gemini-adapter and claude-adapter TypeScript errors from untracked parallel plan files -- out of scope, not committed files.

## User Setup Required

None - no external service configuration required. API keys (FIRECRAWL_API_KEY, PERPLEXITY_API_KEY) needed at runtime only.

## Next Phase Readiness
- All 4 enrichment adapters now have implementations (claude, gemini, firecrawl, perplexity)
- Ready for Plan 02-04 batch runner to orchestrate all adapters
- SerpAPI URL file (`data/serpapi-urls.json`) is a soft dependency -- FireCrawl adapter works without it

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 02-enrichment-engine*
*Completed: 2026-03-13*

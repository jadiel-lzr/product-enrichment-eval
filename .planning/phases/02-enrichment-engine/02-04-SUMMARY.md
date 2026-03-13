---
phase: 02-enrichment-engine
plan: 04
subsystem: enrichment
tags: [batch-runner, cli, checkpoint-resume, reports, csv-output, p-limit]

# Dependency graph
requires:
  - phase: 02-enrichment-engine
    provides: All four adapters, shared enrichment metadata helpers, checkpoint module, image preparation
provides:
  - Batch runner with checkpoint/resume and concurrent per-product execution
  - Run report generation with per-tool and per-field metrics
  - CLI entry point for single-tool or sequential all-tool runs
  - Gitignored output artifacts for enriched CSVs, checkpoints, and reports
affects: [03-core-comparison-ui, 04-analysis-and-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch-orchestration, checkpoint-resume, report-generation, cli-entrypoint]

key-files:
  created:
    - enrichment/src/batch/runner.ts
    - enrichment/src/batch/report.ts
    - enrichment/src/batch/__tests__/runner.test.ts
    - enrichment/src/batch/__tests__/report.test.ts
    - enrichment/src/scripts/enrich.ts
  modified:
    - enrichment/package.json
    - enrichment/src/parsers/csv-writer.ts
    - .gitignore

key-decisions:
  - "CSV writer accepts generic row objects because enriched output rows can diverge from parsed Product runtime types"
  - "Checkpoint artifacts persist row + result payloads so resumed runs preserve prior enriched data instead of downgrading resumed rows"
  - "CLI prints usage and exits non-zero when --tool is missing or invalid"

patterns-established:
  - "Sequential multi-tool execution: --tool all runs claude, gemini, firecrawl, perplexity in order"
  - "Per-tool checkpoints: data/checkpoints/checkpoint-{tool}.json"
  - "Per-tool reports: data/reports/run-report-{tool}.json"

requirements-completed: [PIPE-03, PIPE-04, PIPE-05]

# Metrics
completed: 2026-03-13
verification:
  - "npx vitest run --reporter=verbose"
  - "npx tsc --noEmit"
  - "npx tsx src/scripts/enrich.ts"
  - "npx tsx src/scripts/enrich.ts --tool invalid"
---

# Phase 2 Plan 4: Batch Runner and CLI Summary

**Batch runner with checkpoint/resume, JSON run reports, and CLI wiring for claude, gemini, firecrawl, perplexity, or all tools sequentially**

## Accomplishments

- Added `runBatch()` with p-limit concurrency, per-product image preparation, adapter invocation, atomic checkpoint writes, and enriched CSV output
- Added checkpoint artifact persistence so resumed runs keep previously enriched row payloads and `EnrichmentResult` data
- Added `generateRunReport()` and `writeRunReport()` for success/partial/failed counts, average fill rate, per-field fill rates, and captured errors
- Added `src/scripts/enrich.ts` with `--tool claude|gemini|firecrawl|perplexity|all`
- Added artifact ignores for `data/checkpoints/` and `data/reports/`
- Verified the full `enrichment` package test suite and TypeScript compilation

## Verification

- `npx vitest run --reporter=verbose` -> 176 tests passed
- `npx tsc --noEmit` -> clean
- `npx tsx src/scripts/enrich.ts` -> usage printed
- `npx tsx src/scripts/enrich.ts --tool invalid` -> invalid tool error + usage printed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSV writer type boundary had to be widened**
- **Found during:** TypeScript verification
- **Issue:** Enriched output rows can overwrite parsed `Product` field shapes, notably `gtin`, when writing final CSV output
- **Fix:** Updated `csv-writer.ts` to accept generic row objects instead of only `Product[]`
- **Verification:** `npx tsc --noEmit` clean, full test suite green

### Known limitations

- This resume did not recreate the original GSD atomic task commits because the worktree already contained unrelated in-progress changes. The implementation and verification are complete, but commit-level phase history was not backfilled in this pass.

## Self-Check: PASSED

- Plan files implemented on disk
- Full `enrichment` test suite passes
- TypeScript compiles cleanly
- CLI usage and invalid-tool paths verified

---
*Phase: 02-enrichment-engine*
*Completed: 2026-03-13*

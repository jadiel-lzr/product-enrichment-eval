---
phase: 260320-dho
plan: 01
subsystem: enrichment, ui
tags: [noimg-pipeline, image-confidence, url-filter, audit]

provides:
  - "SCRIPT-AUDIT.md documenting 8 pipeline issues with severity/location/fix"
  - "image_confidence field in NoImgEnrichedFieldsSchema and Phase 2 output"
  - "detectVariantConfidence heuristic based on _00N URL patterns"
  - "Frontend badge for verified (green) and variant_uncertain (amber)"
  - "isValidImageUrl blocks Header-CB-Made-In-Italy.jpg and DG.png"

tech-stack:
  added: []
  patterns:
    - "Variant detection via _0XX URL suffix pattern matching"
    - "Confidence tagging flows from enrichment schema through CSV to frontend badge"

key-files:
  created:
    - ".planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md"
  modified:
    - "enrichment/src/types/noimg-enriched.ts"
    - "enrichment/src/scripts/enrich-noimg-phase2.ts"
    - "enrichment/src/adapters/noimg-claude-adapter.ts"
    - "frontend/src/types/enrichment.ts"
    - "frontend/src/lib/csv-loader.ts"
    - "frontend/src/components/comparison/EnrichmentCard.tsx"

key-decisions:
  - "Variant detection uses _0XX pattern only; Kering _F/_R/_D/_E and Giglio _1/_2/_3 are NOT variants"
  - "image_confidence is recomputed from URLs on each run, not stored in checkpoint"
  - "Short all-caps filename filter uses /[A-Z]{2,5}\\d?\\.(ext)$/ anchored to slash"

requirements-completed: [AUDIT-01, CONFIDENCE-01, FILTER-01]

duration: 4min
completed: 2026-03-20
---

# Quick Task 260320-dho: Script Audit + Variant Confidence Tagging Summary

**Pipeline audit report with 8 documented issues, image_confidence field with variant detection heuristic, and two isValidImageUrl filter fixes blocking banner/logo images**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T12:56:50Z
- **Completed:** 2026-03-20T13:01:07Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- SCRIPT-AUDIT.md documents 8 issues (3 medium, 5 low) plus 4 not-an-issue clarifications for the enrich-noimg pipeline
- image_confidence field added end-to-end: enrichment schema, Phase 2 detection logic, frontend CSV parsing, and EnrichmentCard badge rendering
- isValidImageUrl now blocks Header-CB-Made-In-Italy.jpg (7+ affected products) and DG.png (2 affected products)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write SCRIPT-AUDIT.md** - `1399845` (docs)
2. **Task 2: Add image_confidence field to pipeline and frontend** - `1be0f60` (feat)
3. **Task 3: Fix two filter bugs in isValidImageUrl** - `8e690ae` (fix)

## Files Created/Modified

- `.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md` - Standalone audit report with 8 issues documented
- `enrichment/src/types/noimg-enriched.ts` - Added image_confidence enum field to NoImgEnrichedFieldsSchema
- `enrichment/src/scripts/enrich-noimg-phase2.ts` - Added detectVariantConfidence() and image_confidence assignment in worker
- `enrichment/src/adapters/noimg-claude-adapter.ts` - Added header[_-] to banner regex, added short acronym filename filter
- `frontend/src/types/enrichment.ts` - Added imageConfidence to ToolEnrichment interface
- `frontend/src/lib/csv-loader.ts` - Parse image_confidence from CSV into imageConfidence
- `frontend/src/components/comparison/EnrichmentCard.tsx` - Render green/amber badge in URL Discovery section

## Decisions Made

- Variant detection uses only the `_0XX` three-digit suffix pattern (e.g. _001, _002). Kering shot codes (_F/_R/_D/_E), Giglio view suffixes (_1/_2/_3), and SFCC view indices (_0/_1/_5) are explicitly excluded as they represent view angles, not color variants.
- image_confidence is computed fresh from URLs each run, not persisted in the checkpoint. No checkpoint format change needed.
- Short acronym filter regex is case-insensitive and anchored to a preceding slash to avoid false positives on product codes containing underscores or dots.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- 2 pre-existing test failures in gemini-adapter.test.ts (timeout field mismatch) unrelated to this task. Not caused by changes, not in scope.

## User Setup Required

None - no external service configuration required.

## Next Steps

- Re-run Phase 2 (`npx tsx src/scripts/enrich-noimg-phase2.ts`) to populate image_confidence in the CSV
- Run `npm run copy-data` from frontend to pick up updated CSV
- Review SCRIPT-AUDIT.md for prioritized fix list

## Self-Check: PASSED

All files exist, all commits verified.

---
*Quick Task: 260320-dho*
*Completed: 2026-03-20*

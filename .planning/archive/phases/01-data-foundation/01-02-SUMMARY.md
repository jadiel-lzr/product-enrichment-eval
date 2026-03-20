---
phase: 01-data-foundation
plan: 02
subsystem: data-pipeline
tags: [cleaning, normalization, csv, immutable-transforms, tsx]

# Dependency graph
requires:
  - phase: 01-data-foundation-01
    provides: ProductSchema, parseProductCSV, writeProductCSV, JSON column parsing
provides:
  - filterTestProducts detecting and removing test/placeholder products
  - normalizeProduct applying color lowercase + title trim immutably
  - cleanProducts orchestrating filter -> normalize -> compute metadata pipeline
  - generateCleaningReport producing structured audit trail
  - parse-and-clean CLI script producing data/base.csv and cleaning-report.json
  - data/base.csv with 498 cleaned products ready for enrichment
  - data/cleaning-report.json audit trail for client presentation
affects: [01-03, 02-enrichment-engine, 03-core-ui]

# Tech tracking
tech-stack:
  added: [tsx@4.21]
  patterns: [immutable-pipeline-composition, single-pass-filter-with-audit, placeholder-metadata-columns]

key-files:
  created:
    - enrichment/src/cleaning/filters.ts
    - enrichment/src/cleaning/normalizers.ts
    - enrichment/src/cleaning/report.ts
    - enrichment/src/cleaning/cleaner.ts
    - enrichment/src/scripts/parse-and-clean.ts
    - enrichment/src/cleaning/__tests__/filters.test.ts
    - enrichment/src/cleaning/__tests__/normalizers.test.ts
    - enrichment/src/cleaning/__tests__/report.test.ts
    - enrichment/src/cleaning/__tests__/cleaner.test.ts
    - data/base.csv
    - data/cleaning-report.json
  modified:
    - enrichment/package.json

key-decisions:
  - "Added tsx as dev dependency for TypeScript CLI script execution (Node 25 strip-types cannot resolve .js extension imports to .ts files)"
  - "Both test products (sku 2083, 2100) detected by name pattern first since both match 'Prodotto Test' and 'Brand di prova'"
  - "_has_images and _image_count set as false/0 placeholders -- Plan 03 updates after image pre-flight"

patterns-established:
  - "Immutable pipeline composition: filter -> normalize -> compute metadata, each step returns new objects"
  - "Single-pass filter with audit: filterTestProducts iterates once, collecting both kept and removed with reasons"
  - "Placeholder metadata columns: _has_images=false, _image_count=0 set during cleaning, updated by later pipeline stages"

requirements-completed: [PIPE-06]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 1 Plan 02: Data Cleaning Pipeline Summary

**Cleaning pipeline removing 2 test products, normalizing colors to lowercase, computing missing-fields metadata, and producing base.csv with 498 enrichment-ready products**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T16:34:22Z
- **Completed:** 2026-03-13T16:42:40Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Cleaning pipeline correctly filters 2 test products (sku 2083, 2100) with audit trail reasons
- All 498 product colors normalized to lowercase+trim, color_original preserved unchanged
- _missing_fields computed from errors array length per product (ranging 3-4 across dataset)
- data/base.csv produced with 498 rows, no test products, all metadata columns present
- data/cleaning-report.json audit trail ready for client presentation
- 60 total tests passing (27 new cleaning tests + 33 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Cleaning modules -- filters, normalizers, report, and orchestrator** - `7b3b1c1` (feat, TDD)
2. **Task 2: parse-and-clean CLI script producing base.csv and cleaning-report.json** - `a4e0915` (feat)

_Note: Task 1 followed TDD RED -> GREEN flow (tests written first, verified failing, then implementation)_

## Files Created/Modified
- `enrichment/src/cleaning/filters.ts` - isTestProduct and filterTestProducts with reason tracking
- `enrichment/src/cleaning/normalizers.ts` - normalizeColor, sanitizeTitle, normalizeProduct (immutable composition)
- `enrichment/src/cleaning/report.ts` - CleaningReport type, generateCleaningReport, writeCleaningReport
- `enrichment/src/cleaning/cleaner.ts` - cleanProducts orchestrator: filter -> normalize -> compute metadata
- `enrichment/src/scripts/parse-and-clean.ts` - CLI script orchestrating parse -> clean -> write pipeline
- `enrichment/src/cleaning/__tests__/filters.test.ts` - 8 tests for test product detection and filtering
- `enrichment/src/cleaning/__tests__/normalizers.test.ts` - 9 tests for color/title normalization and immutability
- `enrichment/src/cleaning/__tests__/report.test.ts` - 3 tests for report generation and JSON writing
- `enrichment/src/cleaning/__tests__/cleaner.test.ts` - 7 tests for full pipeline orchestration
- `enrichment/package.json` - Added tsx dev dependency and parse-and-clean script
- `data/base.csv` - 498 cleaned products with metadata columns
- `data/cleaning-report.json` - Audit trail listing 2 removed test products

## Decisions Made
- Added tsx as dev dependency for TypeScript CLI script execution. Node 25's native `--experimental-strip-types` and `--experimental-transform-types` flags cannot resolve `.js` extension imports (used in `nodenext` module resolution) to `.ts` source files. tsx handles this seamlessly and is already commonly used in the Node ecosystem.
- Both test products (sku 2083, 2100) have both matching patterns (name contains "Prodotto Test" AND brand equals "Brand di prova"). The filter detects them by name pattern first since it checks `includes('Prodotto Test')` before `brand === 'Brand di prova'`.
- _has_images set to false and _image_count set to 0 as deliberate placeholders. Plan 03 (image pre-flight) will read base.csv, check image URLs, cache images, and update these fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tsx for TypeScript CLI script execution**
- **Found during:** Task 2 (parse-and-clean script)
- **Issue:** `node src/scripts/parse-and-clean.ts` fails with ERR_MODULE_NOT_FOUND because Node 25 strip-types cannot resolve `.js` imports to `.ts` files in ESM nodenext mode
- **Fix:** Installed tsx as dev dependency, updated package.json script to use `tsx` instead of `node`
- **Files modified:** enrichment/package.json, enrichment/package-lock.json
- **Verification:** `npx tsx src/scripts/parse-and-clean.ts` runs successfully, produces correct output
- **Committed in:** a4e0915 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necessary for CLI script execution. tsx is a lightweight, well-maintained dependency. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- data/base.csv contains 498 cleaned products ready for Plan 03 (image pre-flight)
- Cleaning modules are importable for any future re-cleaning needs
- CleaningReport type and writeCleaningReport can be reused by other pipeline stages
- All 60 tests passing, tsc --noEmit clean

## Self-Check: PASSED

All 11 created files verified on disk. Both task commits (7b3b1c1, a4e0915) verified in git log.

---
*Phase: 01-data-foundation*
*Completed: 2026-03-13*

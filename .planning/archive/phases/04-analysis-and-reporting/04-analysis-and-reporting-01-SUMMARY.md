---
phase: 04-analysis-and-reporting
plan: 01
subsystem: ui
tags: [react, typescript, vitest, analysis, reporting]
requires:
  - phase: 03-core-comparison-ui
    provides: product filtering, client-side CSV state, comparison data contracts
provides:
  - explicit score availability modeling for tool enrichments
  - pure analysis engine for rankings, field winners, completeness, and exports
  - weighting presets with manual override support
  - regression tests for no-fake-confidence behavior
affects: [04-02, analysis-ui, csv-export]
tech-stack:
  added: [vitest]
  patterns: [pure analysis utilities, confidence-vs-no-confidence ranking tracks, weighted field scoring]
key-files:
  created:
    - frontend/src/lib/analysis/types.ts
    - frontend/src/lib/analysis/weights.ts
    - frontend/src/lib/analysis/scoring.ts
    - frontend/src/lib/analysis/__tests__/scoring.test.ts
  modified:
    - frontend/src/types/enrichment.ts
    - frontend/src/lib/csv-loader.ts
    - frontend/package.json
    - frontend/package-lock.json
key-decisions:
  - "Tool enrichments now carry scoreTrack so missing confidence is modeled from data, not inferred from tool name."
  - "Ranking output is split into confidence and no-confidence tracks, while still keeping all tools visible in analysis summaries."
  - "Balanced weighting remains the default preset, with named alternatives and manual field overrides layered on top."
patterns-established:
  - "Analysis engine functions are pure and deterministic from products, enrichments, and weights."
  - "CSV score parsing accepts both _accuracy_score and _enrichment_accuracy_score, but invalid or missing values remain undefined."
requirements-completed: [UI-08, UI-09, UI-11, UI-12]
duration: 16 min
completed: 2026-03-13
---

# Phase 4 Plan 01: Analysis Contracts and Scoring Summary

**Typed analysis contracts and a pure scoring engine that rank tools, track no-confidence data honestly, compute field winners and completeness, and export the current analysis view**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-13T19:17:00Z
- **Completed:** 2026-03-13T19:33:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added explicit `scoreTrack` handling and loader normalization for `_accuracy_score` plus `_enrichment_accuracy_score` without fabricating missing confidence.
- Defined the Phase 4 analysis contract layer, weighting presets, and manual override model for downstream UI work.
- Built and tested pure analysis utilities for full-dataset ranking, filtered-slice ranking, field winners, completeness metrics, and export rows.

## Task Commits

Atomic task commits were attempted but blocked by repository git write restrictions:

1. **Task 1: Normalize analysis contracts and score availability** - not committed, `git commit` blocked by `.git/index.lock` creation permission failure
2. **Task 2: Build the pure scoring engine** - not committed, same git write restriction blocked task commits after verification

**Plan metadata:** not committed, same git write restriction blocked the final docs commit

## Files Created/Modified

- `frontend/src/types/enrichment.ts` - adds `ScoreTrack` and exposes score availability on each tool enrichment
- `frontend/src/lib/csv-loader.ts` - parses both supported score columns and marks rows as `confidence` or `no-confidence`
- `frontend/src/lib/analysis/types.ts` - defines ranking, winner, completeness, export, and weight contracts
- `frontend/src/lib/analysis/weights.ts` - defines balanced, accuracy-first, and completeness-first presets plus manual override merging
- `frontend/src/lib/analysis/scoring.ts` - implements pure ranking, winner, completeness, takeaway, and export builders
- `frontend/src/lib/analysis/__tests__/scoring.test.ts` - covers ranking scope changes, no-fake-confidence behavior, weighting, winner thresholds, completeness, and export rows
- `frontend/package.json` - adds `test` script and Vitest dependency
- `frontend/package-lock.json` - locks Vitest and related packages

## Decisions Made

- Used `scoreTrack` on the data model so missing confidence remains a first-class contract rather than a UI heuristic.
- Treated tools as confidence-backed only when every row in the analyzed slice has a real confidence score, which prevents mixed slices from looking more certain than they are.
- Kept field-winner logic coverage-based and thresholded so low-margin results can be labeled too close to call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worked around a root-owned npm cache during Vitest install**
- **Found during:** Task 2 (test runner setup)
- **Issue:** `npm install --legacy-peer-deps` failed with `EACCES` because the global npm cache contained root-owned files
- **Fix:** Re-ran install with `npm_config_cache=.npm-cache` so dependencies could be installed without mutating machine-level state
- **Files modified:** `frontend/package-lock.json`
- **Verification:** `npx vitest run src/lib/analysis/__tests__/scoring.test.ts` passed
- **Committed in:** not committed, git writes blocked by environment

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The workaround was necessary to complete verification and did not change runtime behavior.

## Issues Encountered

- Git writes are blocked in this environment. `git add` and `git commit` fail with `fatal: Unable to create '.git/index.lock': Operation not permitted`, so the required atomic commits and final docs commit could not be created even though code and docs changes were completed.
- The frontend dependency graph still requires `--legacy-peer-deps` because the repo already carries the known Tailwind Vite peer mismatch recorded in project state.

## User Setup Required

None, no external services or secrets were needed for this plan.

## Next Phase Readiness

- Phase `04-02` can consume stable analysis contracts, weighting presets, and tested pure scoring utilities without adding business logic in the UI layer.
- Remaining risk: git permissions need to be fixed before the required per-task commits and metadata commit can be recorded through GSD.

## Self-Check: PASSED

- Found `frontend/src/lib/analysis/types.ts`
- Found `frontend/src/lib/analysis/weights.ts`
- Found `frontend/src/lib/analysis/scoring.ts`
- Found `frontend/src/lib/analysis/__tests__/scoring.test.ts`
- Verified `npx tsc -p tsconfig.app.json --noEmit`
- Verified `npx vitest run src/lib/analysis/__tests__/scoring.test.ts`

---
*Phase: 04-analysis-and-reporting*
*Completed: 2026-03-13*

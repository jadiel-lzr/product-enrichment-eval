---
phase: quick
plan: 260320-jws
subsystem: frontend/analysis
tags: [analysis, pipeline-quality, without-images, dashboard]
dependency_graph:
  requires: [ProductContext, ToolEnrichment types]
  provides: [NoImgAnalysisView, useNoImgAnalysis hook]
  affects: [App.tsx routing, analysis toggle visibility]
tech_stack:
  added: []
  patterns: [pipeline-funnel visualization, dataset-aware routing]
key_files:
  created:
    - frontend/src/hooks/useNoImgAnalysis.ts
    - frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx
    - frontend/src/components/analysis/noimg/PipelineFunnel.tsx
    - frontend/src/components/analysis/noimg/UrlDiscoveryStats.tsx
    - frontend/src/components/analysis/noimg/ImageQualityStats.tsx
    - frontend/src/components/analysis/noimg/EnrichmentCoverage.tsx
    - frontend/src/components/analysis/noimg/AccuracyDistribution.tsx
  modified:
    - frontend/src/App.tsx
decisions:
  - "Used filteredProducts as basis for all stats (respects sidebar filters)"
  - "Score distribution bars scaled relative to max bucket count for visual clarity"
  - "Replaced isSingleTool gate with dataset-aware showToggle flag"
metrics:
  duration: 3m 27s
  completed: 2026-03-20
  tasks: 3/3
---

# Quick Task 260320-jws: Revamp Analysis Page for Products Without Images Summary

Pipeline quality Analysis view for the without-images dataset with 5 stat sections: funnel conversion, URL discovery, image quality, enrichment coverage, and accuracy distribution -- all computed from ProductContext via useNoImgAnalysis hook.

## What Was Built

### useNoImgAnalysis hook (Task 1)
Central data hook that derives all pipeline stats from `filteredProducts` and `enrichmentsByProduct`. Returns a single immutable `NoImgAnalysisStats` object with 5 sections: funnel steps, URL discovery confidence breakdown, image quality distribution, enrichment coverage with per-field fill rates, and accuracy score distribution. All computations are memoized.

### 5 Section Components (Task 2)
- **PipelineFunnel** -- Horizontal bar funnel showing conversion from total products through source URLs, images, unflagged images, to enriched. Uses progressively lighter gray bars with emerald for the final "Enriched" step.
- **UrlDiscoveryStats** -- Two stat boxes (with/without source URL) plus confidence breakdown bars (high=emerald, medium=amber, none=gray).
- **ImageQualityStats** -- 4-stat grid (has images, no images, has flagged, all flagged) with color-coded image confidence score distribution bars and average confidence display.
- **EnrichmentCoverage** -- Status distribution boxes (success/partial/failed/not enriched), overall fill rate progress bar, and per-field fill rate bars sorted by rate descending.
- **AccuracyDistribution** -- Large average score display with bucket distribution bars.

### App.tsx Integration (Task 3)
- Analysis toggle now shows for `without-images` dataset (was previously hidden when only one tool).
- Analysis mode routes to `NoImgAnalysisView` when dataset is `without-images`, `AnalysisView` otherwise.
- Compare mode always renders `ComparisonView` regardless of dataset.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b171176 | useNoImgAnalysis hook with pipeline quality stats |
| 2 | 967769e | NoImgAnalysisView with 5 pipeline quality sections |
| 3 | 4376dca | Wire NoImgAnalysisView into App.tsx with dataset-aware toggle |

## Self-Check: PASSED

All 8 files verified present. All 3 commits verified in history. Build succeeds with no type errors.

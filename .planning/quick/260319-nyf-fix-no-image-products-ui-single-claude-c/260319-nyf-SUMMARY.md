---
phase: quick
plan: 260319-nyf
subsystem: frontend
tags: [no-image, dataset, comparison-ui, field-mapping]
one_liner: "Fixed no-image products UI: single Claude card, correct field mapping, confidence/match display, analysis hidden"
---

# Quick Task Summary: Fix No-Image Products UI

## What Changed

### Field Mapping Fix (`dataset.ts`)
- Added `normalizeEnrichedRow` to DatasetConfig interface
- `normalizeNoImageRow` now copies `description` → `description_eng` and `materials_original` → `materials` so original data displays correctly
- `normalizeNoImageEnrichedRow` does the same for enriched CSV rows

### New Enrichment Fields (`enrichment.ts`, `csv-loader.ts`)
- Added `confidenceScore` and `matchReason` to ToolEnrichment type
- CSV loader reads `confidence_score` and `match_reason` from enriched CSV rows
- `image_links` already supported (pipe-separated URLs)

### Single-Tool Comparison (`ComparisonView.tsx`)
- When only 1 tool has data, renders single full-width card instead of 2x2 grid with 3 empty cards
- Hides the "Showing/Missing tools" availability banner in single-tool mode

### Confidence & Match Display (`EnrichmentCard.tsx`)
- Shows confidence score as colored badge (green=high, yellow=medium, gray=low)
- Shows match reason text explaining why the URL was matched
- Source URL and image links display when available

### Analysis Hidden (`App.tsx`)
- Analysis mode toggle hidden when ≤1 tool available (no comparison to make)
- Forces compare mode in single-tool datasets even if mode state was 'analysis'

## Files Modified
- `frontend/src/types/dataset.ts`
- `frontend/src/types/enrichment.ts`
- `frontend/src/lib/csv-loader.ts`
- `frontend/src/components/comparison/ComparisonView.tsx`
- `frontend/src/components/comparison/EnrichmentCard.tsx`
- `frontend/src/App.tsx`

# Quick Task 260320-dho: Script Audit + Variant Confidence Tagging - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Task Boundary

Two deliverables for the no-image enrichment pipeline:
1. Script audit of enrich-noimg (Phase 1) and enrich-noimg-phase2 (Phase 2) — flag critical issues
2. Variant confidence tagging — add image_confidence field to detect products with unknown color/variant

</domain>

<decisions>
## Implementation Decisions

### Audit Output Format
- Standalone SCRIPT-AUDIT.md report in the quick task directory
- No inline code comments or TODOs — keep scripts untouched for the other dev
- Easy to share and review asynchronously

### Confidence Field Location
- Add `image_confidence` as a new column in the enriched-noimg-claude.csv output
- Set in Phase 2 script logic during image extraction
- Read in frontend via csv-loader and display as badge on EnrichmentCard

### Timing / Backfill
- Code changes only — prepare the logic in Phase 2 script + frontend
- No backfill of existing data; next Phase 2 re-run will populate the field
- Frontend should handle missing/empty image_confidence gracefully (treat as 'unverified')

### Claude's Discretion
- Variant detection heuristic: check for numeric variant patterns in image URLs (_001, _002, etc.)
- image_confidence values: 'verified' (color matched), 'variant_uncertain' (no color, multiple variants), 'unverified' (default/missing)
- No names used in reports or code comments

</decisions>

<specifics>
## Specific Ideas

- D&B product 3850073: junk DG.png from d3adw1na09u8f7.cloudfront.net — note in audit
- Montblanc product 2000000029733: MB0122S_001 through _004 variant pattern — test case for detection
- Phase 2 checkpoint race condition on line 180-181 — flag in audit
- verifyUrl uses GET not HEAD — flag in audit

</specifics>

# Phase 1: Data Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse, clean, and validate the source CSV (`originalUnEnrichedProductFeed.csv`, 499 products, 38 columns) into typed product objects with image pre-flight. Produces the data layer that all enrichment adapters (Phase 2) and the frontend (Phase 3+) consume. No enrichment logic lives here — only ingestion, cleaning, validation, and image caching.

</domain>

<decisions>
## Implementation Decisions

### Data Cleaning Rules
- Pattern matching to identify and remove test/placeholder products (e.g., names containing "Prodotto Test", brands matching "Brand di prova")
- Colors normalized to lowercase + trim (e.g., "GREENISH MOLD" → "greenish mold"); `color_original` column preserves raw vendor value
- Title sanitization: trim whitespace
- Products with zero reachable images are kept but flagged separately (via `_has_images` column) — they form a distinct group for enrichment comparison (text-only vs text+image)
- Cleaning produces both a console summary and a detailed log file (`data/cleaning-report.json`) listing every product filtered and why

### Column Mapping Strategy
- Curated subset of columns sent to enrichment tools: identifiers (sku, code, model), product info (name, brand, color, category, department, materials), pricing, and existing field values — skip raw/original duplicates and internal metadata
- All embedded JSON columns parsed into typed arrays at load time: `images` → `string[]`, `errors` → `ErrorEntry[]`, `sizes` → `SizeEntry[]`
- Preserve all `_original` columns (color_original, category_original, department_original, etc.) in the Product type as read-only reference
- Hybrid enrichment approach: use the `errors` column as a starting manifest of missing fields, but also allow tools to fill additional fields they judge important beyond the 6 target fields

### Image Pre-flight Scope
- Cache ALL reachable images per product (not just the first) — products have 1-3 image URLs each
- Store as raw files on disk: `data/images/{sku}_{index}.{ext}` (JPEG/PNG/WebP)
- Convert to base64 on-demand in Phase 2 when sending to LLM vision APIs
- Broken/unreachable URLs: retry once after short delay, then log and skip
- Image manifest (`data/image-manifest.json`) tracks per URL: status (reachable/unreachable), content-type, file size, local path

### Output Format
- `data/base.csv` contains only cleaned/valid products (test products removed)
- Embedded JSON columns (sizes, errors, images) kept as JSON strings in CSV — TypeScript types handle parsing at load time
- Add 3 computed metadata columns: `_missing_fields` (count of fields needing enrichment), `_has_images` (boolean), `_image_count` (number of cached images)
- Single base.csv file with `_has_images` flag rather than separate files per image group

### Claude's Discretion
- Exact Zod schema strictness levels (strict vs passthrough for unknown fields)
- CSV parsing configuration details (delimiter handling, quote escaping)
- Image download concurrency and timeout values
- TypeScript project scaffolding structure (tsconfig, package.json setup)
- Error handling specifics during CSV parsing and image downloading

</decisions>

<specifics>
## Specific Ideas

- The errors column in the source CSV is a pre-built "what needs enriching" manifest — parse it and use it to drive per-product enrichment targets
- Products with vs without images form a natural A/B comparison for Phase 2: how do tools perform with multi-modal input vs text-only?
- The cleaning report (data/cleaning-report.json) serves as an audit trail for the client presentation — shows data quality before enrichment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing code — greenfield project. Only the source CSV and planning documents exist.
- docs/PLAN.md contains a pre-planned architecture with directory structure (enrichment/ and frontend/ workspaces)
- PapaParse referenced from product-middleware as the CSV parsing library

### Established Patterns
- docs/PLAN.md defines the adapter interface: `EnrichmentTool { name: string; enrich(product: Product): Promise<EnrichedFields> }`
- Output convention: `data/enriched-{tool}.csv` per enrichment tool, `data/base.csv` for cleaned source
- Enriched CSV format adds metadata columns: `_enriched_fields`, `_enrichment_tool`, `_enrichment_status`, `_enrichment_error`

### Integration Points
- `data/base.csv` → consumed by all enrichment adapters in Phase 2
- `data/images/` → consumed by LLM adapters (Claude, Gemini) in Phase 2 for vision input AND by Phase 5 SerpAPI URL Discovery for visual search
- `data/image-manifest.json` → consumed by Phase 2 to know which images are available per product AND by Phase 5 for selecting images to send to Google Lens
- Shared TypeScript types (`Product`, `EnrichedFields`, `ErrorEntry`, `SizeEntry`) → imported by both enrichment scripts and frontend
- Zod schemas → used for validation at CSV parse boundary and by frontend for runtime safety
- Phase 5 (SerpAPI) depends on this phase's image cache — `data/images/` and `data/image-manifest.json` are the handoff point

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-03-13*

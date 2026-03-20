# Phase 2: Enrichment Engine - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Build all 4 enrichment adapters (Claude, Gemini, FireCrawl, Perplexity) behind a shared interface, with a resilient batch runner that supports checkpoint/resume, and produce one enriched CSV per tool with metadata tracking. Each adapter fills an expanded set of target fields (9+ fields) for ~498 products. LLM adapters additionally produce a per-product accuracy score.

</domain>

<decisions>
## Implementation Decisions

### LLM Prompt & Confidence Rules
- Field-dependent confidence strategy:
  - **Conservative** for factual fields (GTIN, dimensions, year, weight) — leave blank if uncertain, wrong data is worse than missing
  - **Aggressive** for generative fields (description_eng, season, collection, materials, made_in) — always attempt to fill, even with moderate confidence
- Description tone: luxury e-commerce copy, 2-3 sentences, professional style (think NET-A-PORTER / SSENSE — concise, elegant, highlights materials and design)
- Target ALL enrichment fields per product (not just missing ones), but include existing values as context: "season is currently FW23 — confirm or improve"
- LLM adapters output a per-product accuracy score (1-10 integer): "How confident am I in this enrichment overall, considering the product data and images?" — replaces client manual scoring

### Expanded Enrichment Fields
- Original 6: `description_eng`, `season`, `year`, `collection`, `gtin`, `dimensions`
- Added 3: `made_in` (country of origin), `materials_original` (material composition), `weight` (product weight)
- Hybrid approach: target these 9 fields explicitly, but allow LLMs to fill any other relevant fields they discover
- EnrichedFields Zod schema must be updated to include the 3 new fields

### Image Strategy for LLMs
- Send ALL cached images per product (1-3 images per product, 990 total across dataset)
- Resize images to max 1024px longest edge before base64 encoding — balances quality vs token cost
- Text-only fallback for the 1 product without images — still enrich using metadata alone (interesting comparison data point)
- Images converted to base64 on-demand when building LLM requests (not pre-converted)

### FireCrawl Search Strategy
- Brand site first, then Google Shopping fallback — query: `{brand} {name} {model}`
- Use SerpAPI-discovered URLs when available (`data/serpapi-urls.json`), skip to direct scrape if URL exists — saves 1 search credit per product
- If no SerpAPI URL, normal search → parse markdown → fallback scrape flow (mirrors product-middleware pattern)

### Perplexity Approach
- Structured query: send product identifiers (brand, name, model, color, category) and ask for JSON response with the 9+ target fields
- Same output format as LLM adapters — consistent for comparison

### Batch Execution
- CLI flag: `--tool claude|gemini|firecrawl|perplexity|all` — run one tool or all tools
- When running "all", tools process sequentially (all products through tool A, then tool B, etc.)
- Concurrency within a tool run: use p-limit (already installed) for concurrent product processing per tool

### Failure & Partial Results
- Retry 2x with backoff: wait 2s, retry; wait 5s, retry again; then mark as failed and move on
- Store fill rate as numeric percentage in enrichment metadata (e.g., 0.67 = 6/9 fields filled) — UI derives display tiers from this
- Enrichment metadata per product: `_enrichment_tool`, `_enrichment_status` (success/partial/failed), `_enrichment_fill_rate` (0.0-1.0), `_enriched_fields` (comma-separated list), `_enrichment_error` (if failed), `_enrichment_accuracy_score` (1-10, LLM adapters only)

### Claude's Discretion
- Exact concurrency limits per tool (p-limit value)
- Checkpoint file format and resume logic implementation
- Prompt template exact wording (following the decisions above)
- Search query construction details for FireCrawl
- Rate limit detection and throttling logic
- Image resize implementation approach
- Progress logging format and verbosity

</decisions>

<specifics>
## Specific Ideas

- The `errors` column in base.csv is a pre-built "what needs enriching" manifest — use it as context for LLM prompts even though we ask for all fields
- Products with vs without images (497 vs 1) are a natural A/B comparison: how do LLM scores differ with/without visual context?
- LLM accuracy scores replace client manual scoring — this means Phase 3/4 UI should display LLM scores instead of collecting user ratings
- FireCrawl's SerpAPI URL integration is a soft dependency: code should check for `data/serpapi-urls.json` and gracefully skip if not present (Phase 5 may or may not run first)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Product` type and `ProductSchema` (Zod): `enrichment/src/types/product.ts` — all 38+ columns validated, passthrough for unknown fields
- `EnrichedFields` type and `EnrichedFieldsSchema` (Zod): `enrichment/src/types/enriched.ts` — needs expansion from 6 to 9+ fields
- CSV reader/writer: `enrichment/src/parsers/csv-reader.ts`, `csv-writer.ts` — PapaParse-based, handles JSON column serialization
- Image manifest: `data/image-manifest.json` — tracks per-URL: status, content-type, file size, local path
- Cached images: `data/images/{sku}_{index}.{ext}` — raw files on disk, ready for base64 conversion
- p-limit already installed for concurrency control

### Established Patterns
- Zod v3.25 for schema validation (pinned, not v4)
- ESM modules with `.js` extension imports, tsx for CLI execution
- Vitest for testing with coverage
- Row-level error collection pattern (partial results on validation failure)
- JSON columns serialized as strings in CSV, parsed at load time by TypeScript

### Integration Points
- `data/base.csv` → input for all enrichment adapters (498 cleaned products)
- `data/images/` → input for LLM vision adapters (base64 conversion on-demand)
- `data/image-manifest.json` → lookup table for which images exist per product
- `data/serpapi-urls.json` → optional input for FireCrawl adapter (Phase 5 output)
- Output: `data/enriched-{tool}.csv` → consumed by Phase 3 comparison UI
- Shared types from `enrichment/src/types/` → imported by both enrichment adapters and frontend

</code_context>

<deferred>
## Deferred Ideas

- **Remove client manual scoring from UI** — UI-06 (per-product scoring) and UI-07 (localStorage persistence) should be replaced with display of LLM accuracy scores. Affects Phase 3 requirements.
- **LLM score aggregation in dashboard** — Phase 4's aggregate dashboard should use LLM accuracy scores instead of client ratings for per-tool comparison. Affects Phase 4 requirements.
- **Non-LLM tool scoring** — FireCrawl and Perplexity don't produce accuracy scores. Phase 4 analysis should account for this asymmetry (fill rate as proxy for non-LLM tools, accuracy score for LLM tools).

</deferred>

---

*Phase: 02-enrichment-engine*
*Context gathered: 2026-03-13*

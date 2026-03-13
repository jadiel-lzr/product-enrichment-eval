# Roadmap: Product Enrichment Evaluation

## Overview

This project delivers a side-by-side comparison of 4 enrichment tools (Claude, Gemini, FireCrawl, Perplexity) across ~500 real products, presented in a React UI where the client can filter, score, and analyze results to choose the best enrichment strategy. Additionally, SerpAPI (Google Lens) provides a visual URL discovery layer that finds accurate product page URLs to feed into scraping tools. The work flows from data foundation through enrichment execution to a two-layer frontend: core comparison UI first, then analysis and reporting on top.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - Parse, clean, and validate source CSV into typed products with image pre-flight
- [ ] **Phase 2: Enrichment Engine** - Build all 4 adapters behind a shared interface, batch runner with checkpoint/resume, and produce enriched CSVs
- [ ] **Phase 3: Core Comparison UI** - React app with product browsing, side-by-side cards, visual diff, filtering, per-product scoring, and image display
- [ ] **Phase 4: Analysis and Reporting** - Aggregate dashboard, per-field winner analysis, weighted scores, completeness metrics, and CSV export
- [ ] **Phase 5: SerpAPI URL Discovery** *(DETACHED)* - Visual product search via SerpAPI Google Lens to find accurate product page URLs; feeds into scraping tools for better extraction accuracy

## Phase Details

### Phase 1: Data Foundation
**Goal**: Products from the source CSV are reliably parsed, cleaned, validated, and ready for enrichment -- with working image URLs identified and cached
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-06, PIPE-02
**Success Criteria** (what must be TRUE):
  1. Running the CSV parser against `originalUnEnrichedProductFeed.csv` produces typed product objects with all 38 columns correctly mapped (including embedded JSON fields parsed out)
  2. Cleaning removes test/placeholder products, normalizes colors, sanitizes titles, and trims whitespace -- producing a filtered dataset of only real products
  3. Image URL pre-flight check runs HEAD requests against all product image URLs, reporting which are reachable, and downloads reachable images to a local cache
  4. Shared TypeScript types and Zod schemas for `Product` and `EnrichedFields` are defined and importable by both enrichment scripts and frontend
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding, Zod schemas, CSV reader/writer (PIPE-01)
- [x] 01-02-PLAN.md — Cleaning pipeline, filters, normalizers, base.csv output (PIPE-06)
- [x] 01-03-PLAN.md — Image preflight, download caching, manifest generation (PIPE-02)

### Phase 2: Enrichment Engine
**Goal**: All 4 enrichment tools process the full product dataset through a resilient batch runner, producing one enriched CSV per tool with metadata tracking
**Depends on**: Phase 1 (Phase 5 SerpAPI output is optional — scraping adapters work with or without discovered URLs)
**Requirements**: ENRC-01, ENRC-02, ENRC-03, ENRC-04, ENRC-05, ENRC-06, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. Each of the 4 adapters (Claude, Gemini, FireCrawl, Perplexity) implements the shared `EnrichmentAdapter` interface and fills the same 6 target fields (description_eng, season, year, collection, gtin, dimensions)
  2. LLM adapters (Claude, Gemini) send product images alongside text data when images are available
  3. Running the batch CLI against the full dataset produces one enriched CSV per tool, with each row containing original identifiers plus enriched fields plus enrichment metadata (status, fields enriched, errors)
  4. Killing the batch process mid-run and restarting it resumes from the last checkpoint without re-processing already-completed products or wasting API credits
  5. A run summary report is generated showing per-tool statistics (products processed, fields filled, errors encountered)
**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Shared infrastructure: expanded schema, adapter interface, image resizer, prompt template, checkpoint, retry
- [ ] 02-02-PLAN.md — LLM vision adapters: Claude (Anthropic) and Gemini (Google GenAI) with structured output
- [ ] 02-03-PLAN.md — Non-LLM adapters: FireCrawl (search+scrape) and Perplexity (search-augmented LLM)
- [ ] 02-04-PLAN.md — Batch runner, CLI entry point (--tool flag), and run summary reports

### Phase 3: Core Comparison UI
**Goal**: The client can browse products, view side-by-side enrichment results from all tools, visually see what changed, filter the dataset, and see LLM-generated accuracy scores per product
**Depends on**: Phase 1 (for types and schemas; can use mock CSVs until Phase 2 completes)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. User can browse all products in a navigable list and select any product to view its detailed comparison
  2. Selected product shows one card per enrichment tool side-by-side, each displaying the tool's enriched data for that product
  3. Enriched fields are visually distinguished from original data (color highlighting: green for enriched, gray for unchanged, amber for partially filled)
  4. Product images from feed URLs display on each card, and filtering by brand, category, department, and enrichment completeness narrows the product list
  5. LLM accuracy scores from enriched CSVs display per tool per product, with score data persisting via the CSV data source
**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — React scaffolding, Tailwind, data loading layer, mock CSV generator, application state context (UI-07)
- [ ] 03-02-PLAN.md — Product sidebar with virtual scroll, search, filters, collapse, URL routing (UI-01, UI-05)
- [ ] 03-03-PLAN.md — Comparison cards, color-coded field diffs, images, LLM scores, responsive layout, visual checkpoint (UI-02, UI-03, UI-04, UI-06)

### Phase 4: Analysis and Reporting
**Goal**: The client can see aggregate results, understand which tool wins overall and per-field, configure importance weights, and export everything for their team
**Depends on**: Phase 3
**Requirements**: UI-08, UI-09, UI-10, UI-11, UI-12
**Success Criteria** (what must be TRUE):
  1. Aggregate dashboard displays overall scores and rankings per tool, answering "which tool wins?" at a glance
  2. Per-field winner analysis shows which tool performs best at each of the 6 enrichment fields (e.g., "Claude wins on descriptions, FireCrawl wins on GTIN")
  3. User can configure field importance weights (e.g., description matters more than dimensions) and see weighted quality scores update accordingly
  4. Completeness metrics show fill rate per tool per field, making it clear which tools leave gaps
  5. User can export all scoring results and analysis as a downloadable CSV for sharing with their team
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: SerpAPI URL Discovery *(DETACHED)*

**Goal**: For each product, use SerpAPI Google Lens to perform a visual search with the product image, find the most accurate product page URL, and store the discovered URLs for downstream scraping tools to use
**Depends on**: Phase 1 (needs cleaned product data and cached images)
**Independent of**: Phases 2, 3, 4 — can be built and run by a separate developer in parallel with all other phases
**Requirements**: SERP-01, SERP-02, SERP-03
**Success Criteria** (what must be TRUE):
  1. SerpAPI Google Lens adapter takes a product image and returns ranked product page URLs from visual search results
  2. URL discovery runs against the full product dataset with checkpoint/resume, producing a URL manifest (`data/serpapi-urls.json`) mapping each SKU to its discovered product page URLs
  3. The URL manifest is consumable by Phase 2's scraping adapters (FireCrawl) as an optional input — if a discovered URL exists for a product, the scraper uses it directly instead of searching by text
  4. Discovery metadata tracks per-product: search status, number of results found, confidence/relevance of top result, visual match score

**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases 1-4 execute in numeric order: 1 -> 2 -> 3 -> 4
Phase 5 is DETACHED and can execute independently after Phase 1, in parallel with Phases 2-4.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 3/3 | Complete | 2026-03-13 |
| 2. Enrichment Engine | 0/4 | Planned | - |
| 3. Core Comparison UI | 1/3 | In Progress | - |
| 4. Analysis and Reporting | 0/0 | Not started | - |
| 5. SerpAPI URL Discovery *(DETACHED)* | 0/0 | Not started | - |

---
*Roadmap created: 2026-03-13*
*Last updated: 2026-03-13 (Phase 3, Plan 01 complete)*

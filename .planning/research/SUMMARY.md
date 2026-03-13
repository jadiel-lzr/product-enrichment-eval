# Project Research Summary

**Project:** Product Enrichment Evaluation
**Domain:** Product data enrichment pipeline + multi-tool comparison dashboard (fashion/luxury e-commerce)
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

This is a two-part prototype: a Node.js CLI enrichment pipeline that runs 4-6 enrichment tools (Claude, Gemini, Perplexity, FireCrawl, and optional stretch tools) against ~500 fashion products, and a React comparison dashboard where a client rates and compares the output side-by-side. The dominant architectural insight is that the two halves never talk to each other at runtime — enriched CSVs are the contract between them. The enrichment pipeline writes to disk; the frontend reads from disk. This decoupling is the single most important structural decision and enables parallel development, independent debugging, and reproducible results.

The recommended approach is native SDK per provider (Anthropic, Google GenAI, OpenAI-compatible for Perplexity) behind a uniform `EnrichmentAdapter` interface. This is deliberately NOT a unified LLM SDK (like Vercel AI SDK) because the entire point of the evaluation is to expose provider-specific behavior. The frontend is a static React/Vite app with no backend, scoring stored in localStorage with CSV export as the safety net. The stack is conservative: battle-tested versions of every library, no bleeding-edge releases (Vite 7, not 8; TS 5.9, not 6.0 RC).

The critical risks are: (1) LLM hallucination that looks like valid enrichment — especially for GTINs and dimensions; (2) unfair tool comparison because scrapers extract real data while LLMs generate it, making fill-rate the wrong primary metric; and (3) the enrichment pipeline crashing mid-run with no recovery. All three are addressable through prompt design, field provenance metadata, and per-product JSONL checkpointing built from day one.

## Key Findings

### Recommended Stack

The stack separates cleanly into two independent packages with no runtime sharing, plus a detached SerpAPI URL discovery module. The enrichment CLI uses Node.js 22 LTS with TypeScript 5.9 executed via `tsx` (esbuild-based, zero-config). Each enrichment tool gets its native SDK: `@anthropic-ai/sdk`, `@google/genai` (the new GA SDK — not the deprecated `@google/generative-ai`), and the `openai` SDK pointed at Perplexity's OpenAI-compatible endpoint. SerpAPI (Google Lens) is used as a pre-enrichment URL discovery layer — it takes product images and finds the most accurate product page URLs via visual search, which scraping tools (FireCrawl) can then use directly instead of text-based search. Concurrency is controlled by `p-limit` v7, CSV handling by `papaparse`, and runtime validation at every API boundary by `zod` v4 (14x faster than v3). The frontend uses React 19, Vite 7, and Tailwind CSS v4 — all stable releases. A component library was explicitly rejected because custom comparison card layouts would fight standard component styling.

**Core technologies:**
- `tsx` v4.21 + TypeScript 5.9: script execution — fastest TS runner, no tsconfig needed, better ESM support than ts-node
- `@anthropic-ai/sdk` v0.78 / `@google/genai` v1.44 / `openai` v6.27: provider SDKs — native access to provider-specific features (vision, grounding, citations) rather than unified SDK abstraction
- `serpapi` (SerpAPI Google Lens): URL discovery — visual product search via Google Lens endpoint to find accurate product page URLs; feeds discovered URLs into scraping tools (FireCrawl) for higher-quality extraction
- `papaparse` v5.5: CSV parsing — works in both Node.js and browser, handles quoted/escaped fields; single library for both environments
- `p-limit` v7: concurrency — limits concurrent API calls per tool (2-5); ESM-only, requires `"type": "module"`
- `zod` v4.3: validation — validates API response shapes, CSV row structures, and env vars at startup
- React 19 + Vite 7 + Tailwind 4: frontend — React is a project constraint; Vite 7 chosen over 8 (released day of research); Tailwind v4 needs no PostCSS setup
- `zustand` v5: state management — lightweight store for scoring state, filter state, and selected product; localStorage middleware for persistence
- SerpAPI (`serpapi` npm package): Google Lens visual search — finds accurate product page URLs from product images; output is optional input for scraping adapters

### Expected Features

The feature set was benchmarked against PIM dashboards (Akeneo, Salsify, Pimberly) and LLM leaderboards (Artificial Analysis, LMSYS Arena). The key insight: 500 products x 7 tools x 6 fields = 21,000 data points. A spreadsheet is unusable at this scale. The purpose-built UI is the deliverable.

**Must have (table stakes):**
- CSV data loading with typed product parsing — foundation for everything else
- Side-by-side product cards (one column per tool) — core comparison view
- Visual diff highlighting (enriched vs original, per-field) — shows what each tool actually changed
- Enrichment status indicators and missing field badges — at-a-glance assessment
- Product navigation with pagination — browse 500 products efficiently
- Filtering by brand, category, department, and enrichment status — slice the 500-product dataset
- Field completeness metrics per tool — primary quantitative metric
- Per-product quality scoring (1-5 stars, localStorage) — human judgment is the core evaluation mechanism
- Aggregate summary dashboard — top-level "which tool wins overall?" answer

**Should have (differentiators):**
- Weighted quality score (fields weighted by business importance: description > GTIN > season/year > dimensions)
- Per-field winner analysis — "Claude wins on descriptions, FireCrawl wins on GTIN"
- Export scoring results as CSV — portability for the client's team
- Keyboard shortcuts for rapid scoring — critical for bulk-rating 500 products without mouse fatigue
- Cost-per-enrichment comparison — ROI framing for the final presentation

**Defer to v2+:**
- Category/brand performance heatmap — meaningful only with enough scored data
- Confidence/hallucination flagging (automated) — HIGH complexity, manual scoring already captures this
- Real-time enrichment from UI — architectural mismatch with batch pipeline model
- Database backend for scores — overkill for a 1-3 evaluator prototype

### Architecture Approach

The architecture follows a strict write-path/read-path separation with CSVs as the contract. The enrichment pipeline is a Node.js CLI with one adapter file per tool behind a shared `EnrichmentAdapter` interface — adding a new tool is one new file, zero changes elsewhere. The runner handles batching, checkpointing, and concurrency independently from the adapters, making the system resumable from mid-run crashes. The frontend is a pure static app: all CSVs served from `frontend/public/data/`, parsed by PapaParse at startup, indexed by SKU into an in-memory `Map<SKU, Map<ToolName, Product>>`. No backend, no API server, no database.

**Major components:**
1. `enrichment/adapters/` — one file per tool implementing `EnrichmentAdapter`; wraps external API calls, handles prompt building, validates responses with Zod
2. `enrichment/runner/` — batch processing, checkpoint/resume (JSONL per tool), concurrency via p-limit, run report generation; completely decoupled from adapters
3. `shared/types.ts` + `shared/schemas.ts` — type definitions and Zod schemas imported by both packages; the only shared code between enrichment and frontend
4. `data/` — enriched CSV output files; the physical integration contract between pipeline and UI
5. `frontend/hooks/` — `useProducts` (CSV loading + SKU indexing), `useFilters` (filter state), `useScoring` (localStorage persistence)
6. `frontend/components/` — `ProductGrid`, `ProductCard`, `FieldDiff`, `ScoringPanel`, `AggregateReport`; no routing library (single-page tool)

### Critical Pitfalls

1. **LLM hallucination treated as valid enrichment** — Explicit prompt instruction: "Return null for any field you cannot verify. Never guess GTINs or dimensions." Validate GTINs with checksum logic. Track `_enrichment_source` metadata per field (generated vs extracted). Verify on 10-product sample before full run.

2. **Unfair tool comparison (different information access)** — Scrapers extract real data; LLMs generate/infer it. Both can show the same fill rate with opposite accuracy. Track field provenance metadata in enriched CSVs. Score tools on accuracy AND fill rate separately. The comparison UI must surface these as distinct dimensions.

3. **CSV corruption from embedded JSON** — The source CSV contains nested JSON in columns (sizes, images, errors). Round-tripping this through PapaParse is fragile. Keep enriched output CSVs flat (identifiers + 6 enrichable fields + metadata). Validate parse with row count check after every load.

4. **No resume/checkpoint for 500-product batch runs** — Processing 500 products takes 30-90 minutes per tool; a crash wastes real API money. Write results incrementally to JSONL per product, skip already-processed SKUs on restart. This must be built from day one, not added after the first crash.

5. **Image URL failures silently degrading LLM quality** — Vendor-hosted image URLs (sandbox CDN, B2B wholesaler) will have hotlink protection, expiry, or deletion. Pre-flight all image URLs with HEAD requests, download locally before enrichment runs, and record `_images_available` count per product in metadata.

## Implications for Roadmap

Based on the combined research, a 6-phase structure is recommended. Phases 1-4 cover the enrichment pipeline (write path); Phase 5 covers the comparison UI (read path); Phase 6 covers stretch adapters and polish. The frontend can begin in parallel with Phases 2-3 using mock CSV data.

### Phase 1: Foundation and Data Normalization

**Rationale:** Every downstream component depends on reliable CSV parsing and clean type definitions. The CSV corruption pitfall must be solved before any enrichment runs. This phase has no external dependencies and unblocks all other phases.

**Delivers:** Clean shared types, Zod schemas, a validated CSV reader (source feed), a flat enriched CSV writer, image pre-flight utility, and a filtered/normalized base dataset (test products excluded).

**Addresses:** CSV data loading (P1 feature), product type definitions

**Avoids:** CSV corruption from nested JSON (Pitfall 3), test products polluting results (Pitfall 6), overwriting existing data (Pitfall 10), image failures (Pitfall 5)

**Research flag:** Standard patterns — no deeper research needed. PapaParse docs and Zod v4 docs are sufficient.

### Phase 2: Enrichment Infrastructure and Adapters

**Rationale:** With types and CSV I/O solid, the adapters and prompt infrastructure can be built. The `EnrichmentAdapter` interface defines the contract all adapters must satisfy. Infrastructure (prompt builder, image fetcher, Zod response validation) is built once and shared across all adapters.

**Delivers:** `EnrichmentAdapter` interface, prompt builder (shared across LLM adapters), image-to-base64 utility, and working adapters for Claude, Gemini, FireCrawl, and Perplexity.

**Addresses:** The 4 core enrichment tools that are primary to the evaluation

**Avoids:** LLM hallucination (Pitfall 1) via prompt design, Perplexity parsing failures (Pitfall 8) via schema warm-up and `sonar-pro` model selection, FireCrawl credit exhaustion (Pitfall 13) via 20-product pilot before full run

**Research flag:** Needs attention for Perplexity adapter specifically — structured output reliability issues are documented but require implementation testing. Claude and Gemini are well-documented.

### Phase 3: CLI Runner with Checkpoint/Resume

**Rationale:** The runner orchestrates batch processing across all adapters. Checkpoint logic must be built before any full-dataset runs to protect against crashes and wasted API spend. Rate limit handling is a runner concern, not an adapter concern.

**Delivers:** Idempotent batch runner (JSONL incremental writes, SKU-based deduplication), checkpoint save/load, per-tool concurrency configuration, exponential backoff on 429s, run summary report, and fully enriched CSVs for all 4 core tools.

**Addresses:** 500-product batch processing, no resume on crash (Pitfall 4), rate limit cascading (Pitfall 7)

**Avoids:** Running tools in parallel (Pitfall 7 — run sequentially, p-limit within each tool's run)

**Research flag:** Standard patterns — idempotent pipeline and checkpoint patterns are well-documented.

### Phase 4: Frontend — Core Comparison UI

**Rationale:** With real enriched CSVs available from Phase 3, the comparison UI can be built and validated against actual data. The frontend can start with mock CSVs in Phase 2-3, swapping in real data here.

**Delivers:** Vite/React app with CSV loading (`useProducts` hook, SKU-indexed), product navigation with pagination, side-by-side product cards with visual field diff (green/amber/gray), enrichment status indicators, missing field badges, product images, filtering (brand, category, department, status), field completeness metrics, per-product 1-5 star scoring with localStorage persistence, and aggregate summary dashboard.

**Addresses:** All P1 features from FEATURES.md

**Avoids:** Unfair tool comparison (Pitfall 2) — include field provenance metadata in display; category-blind aggregate scores (Pitfall 9) — filters must be in place before aggregate view; scoring data loss (Pitfall 12) — export button from the start

**Research flag:** Standard React/Vite patterns. No deeper research needed. Tailwind v4 Vite plugin eliminates PostCSS complexity.

### Phase 5: Enrichment Quality Analysis and Presentation Layer

**Rationale:** Once the client begins scoring, they will ask for composite metrics and exportable results. These features are low-complexity additions that dramatically elevate the presentation.

**Delivers:** Weighted quality score per tool (field weights by business importance), per-field winner analysis table, CSV export of scoring results, keyboard shortcuts for rapid scoring (1-5 number keys, arrow navigation), filter by quality tier, and cost-per-enrichment static comparison.

**Addresses:** All P2 features from FEATURES.md

**Research flag:** Standard patterns — no research needed. Static cost data from PLAN.md; keyboard shortcuts are pure event handling.

### Phase 6: Stretch Adapters and Final Polish

**Rationale:** Stretch adapters (Apify, Zyte) can be added after the core evaluation is complete if time allows. Polish includes stratified analysis by brand/category popularity.

**Delivers:** Apify and/or Zyte adapters (both optional), category/brand performance heatmap (if enough rated data exists), final presentation-ready report.

**Addresses:** P3 features from FEATURES.md; Pitfall 9 (description quality varies by category) via stratified reporting

**Research flag:** Apify actor selection needs research (pre-built e-commerce actors vary in quality). Zyte uses plain REST fetch — no SDK needed.

### Phase Ordering Rationale

- Types and CSV first because every other component is typed against `Product` and `EnrichedFields`. Wrong types here cascade everywhere.
- Infrastructure before adapters because the image fetcher and prompt builder are shared; building them before the first adapter means each adapter is thin.
- Runner before full runs because checkpointing must protect every API dollar spent. The first real run cannot be a gamble.
- Frontend can overlap from Phase 2 onward using mock CSVs — the CSV format is the contract, not the enrichment code.
- Stretch adapters last because the architecture trivially supports new adapters; their addition is a single file per tool.
- SerpAPI URL Discovery (Phase 5) is completely detached — depends only on Phase 1 images, can be built by a separate developer in parallel with all other phases. Its output (discovered URLs) is **optional** for other tools: scraping adapters work with or without SerpAPI URLs, but produce better results when URLs are available.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Perplexity adapter):** Documented structured output reliability issues require implementation experimentation. Schema warm-up behavior needs validation against actual API.
- **Phase 5 (SerpAPI Google Lens):** SerpAPI's Google Lens endpoint needs validation for fashion product images. Need to test: result quality for luxury items, rate limits, pricing per search, and how well visual matches correlate with correct product pages. The endpoint returns visual_matches and product results — need to determine the best ranking strategy.
- **Phase 6 (Apify actors):** Pre-built e-commerce scraping actors vary in quality and maintenance. Need to identify the best actor for fashion/luxury product data before committing to the adapter.

Phases with standard patterns (skip research-phase):
- **Phase 1:** PapaParse and Zod are mature with excellent docs. CSV parsing patterns are well-established.
- **Phase 3:** Checkpoint/idempotent pipeline patterns are extensively documented across data engineering resources.
- **Phase 4:** React 19 + Vite 7 + Tailwind v4 are all GA with strong documentation. localStorage patterns are trivial.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All major packages verified against npm with exact versions. SDK deprecations confirmed (old Google AI SDK EOL August 2025). Version choices justified with explicit rationale. |
| Features | HIGH | Benchmarked against real PIM tools (Akeneo, Salsify, Pimberly) and LLM leaderboards. Amazon Science research on hallucination detection cited. Feature dependency graph is well-defined. |
| Architecture | HIGH | Adapter pattern, pipeline pattern, and CSV-as-contract are proven patterns. Build order dependency chain is clear. Anti-patterns are explicit and well-reasoned. |
| Pitfalls | HIGH | Most pitfalls sourced from official API docs (Claude vision limits, Perplexity structured output guide, FireCrawl rate limits), with the hallucination pitfall from EMNLP 2024 research. PapaParse nested JSON limitation is a documented wontfix. |

**Overall confidence:** HIGH

### Gaps to Address

- **SerpAPI Google Lens result quality:** Visual search accuracy for fashion/luxury product images needs empirical validation. Some products may not have distinctive enough images for reliable visual matching (e.g., plain t-shirts). Test on a 20-product sample before full run.
- **Actual product count after deduplication:** The source feed claims ~500 products but contains test/placeholder records ("Prodotto Test", "Brand di prova"). Actual enrichable product count needs to be determined in Phase 1 before estimating API costs and run times.
- **Image URL health is unknown:** The proportion of working vs broken image URLs in the feed is unknown until the Phase 1 pre-flight check runs. If >30% of images are broken, the LLM quality comparison will be significantly degraded and evaluation methodology may need adjustment.
- **Perplexity structured output stability:** The documented schema warm-up latency (10-30 seconds per new schema) and `sonar-reasoning-pro` parsing issues need empirical validation in Phase 2 before committing the approach for 500 products.

## Sources

### Primary (HIGH confidence)
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — v0.78.0, vision support
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) — v1.44.0, replaces deprecated @google/generative-ai
- [Google AI SDK migration notice](https://ai.google.dev/gemini-api/docs/libraries) — @google/generative-ai EOL August 2025
- [Perplexity OpenAI Compatibility Guide](https://docs.perplexity.ai/guides/chat-completions-guide) — use openai SDK with baseURL override
- [Vite Releases](https://vite.dev/releases) — v7.3.x stable; v8.0.0 released March 13 2026
- [Zod v4 docs](https://zod.dev/v4) — 14x faster string parsing vs v3
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) — base64 limits: 5MB, 8000px max
- [Claude Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) — Sonnet: 30K input tokens/min on Tier 1
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) — Flash: 150 RPM on paid tier
- [FireCrawl Rate Limits](https://docs.firecrawl.dev/rate-limits) — credit-based, 3K/month on Hobby
- [Perplexity Structured Outputs Guide](https://docs.perplexity.ai/guides/structured-outputs) — schema warm-up, `<think>` token issue
- [Amazon Science: Hallucination Detection in LLM-enriched Product Listings](https://www.amazon.science/publications/hallucination-detection-in-llm-enriched-product-listings) — EMNLP 2024
- [PapaParse nested structures wontfix](https://github.com/mholt/PapaParse/issues/134) — confirmed limitation
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) — no PostCSS needed with Vite plugin

### Secondary (MEDIUM confidence)
- [WISEPIM Product Data Health Scorecard](https://wisepim.com/ecommerce-dictionary/product-data-health-scorecard) — field weighting patterns
- [Pimberly Completeness Score](https://pimberly.com/glossary/completeness-score/) — completeness metric conventions
- [Derrick App Coverage vs Accuracy Rate](https://derrick-app.com/en/coverage-rate-vs-accuracy-rate-understanding-your-data-enrichment-metrics) — fill rate vs accuracy distinction
- [Artificial Analysis LLM Leaderboard](https://artificialanalysis.ai/leaderboards/models) — comparison UI patterns
- [Adapter Design Pattern for Multiple Third-Party Integrations](https://medium.com/@olorondu_emeka/adapter-design-pattern-a-guide-to-manage-multiple-third-party-integrations-dc342f435daf) — adapter pattern rationale
- [p-limit on npm](https://www.npmjs.com/package/p-limit) — v7.3.0 ESM-only
- [Airbyte: Idempotency in Data Pipelines](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines) — checkpoint/resume patterns

### Tertiary (LOW confidence / needs validation)
- [SerpAPI Google Lens](https://serpapi.com/google-lens-api) — visual product search endpoint for URL discovery
- [Zyte API Reference](https://docs.zyte.com/zyte-api/usage/reference.html) — REST-only, use native fetch

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*

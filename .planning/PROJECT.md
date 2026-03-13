# Product Enrichment Evaluation

## What This Is

A validation project that compares multiple product data enrichment tools (Claude, Gemini, FireCrawl, Perplexity, and stretch candidates Apify/Zyte/Describely) on ~500 real products from vendor feeds. Results are presented in a React comparison UI with filtering and scoring so the client can choose the best enrichment strategy.

## Core Value

The client can visually compare enrichment quality across tools and make an informed decision on which approach to adopt for their product catalog.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Enrich ~500 products with each tool, filling missing fields (description, season, year, collection, gtin, dimensions)
- [ ] Output one CSV per enrichment tool with enriched data
- [ ] React comparison UI showing side-by-side product cards per tool
- [ ] Filtering by brand, category, department, enrichment completeness
- [ ] Client scoring system to rate each tool's output quality
- [ ] Visual diff highlighting enriched vs original fields
- [ ] Product image display from feed URLs
- [ ] Aggregate comparison report per tool

### Out of Scope

- Database integration — this is a standalone evaluation, not production pipeline
- Shopify sync — no publishing, just comparison
- Image enrichment (finding better images) — focus is on data fields
- Production-grade error handling — prototype quality is acceptable
- Authentication — this is an internal/demo tool

## Context

### Current Enrichment System (product-middleware)

The existing pipeline in `product-middleware` uses a 3-phase FireCrawl strategy:
1. Search via `/v2/search` (1 credit, ~3s) — returns markdown
2. Parse markdown locally with `MarkdownFieldExtractor` — instant
3. Fallback: scrape URL directly via `/v1/scrape` (1 credit)

**Known limitations:**
- Markdown parsing depends heavily on page structure — many sites have messy HTML
- Description extraction rejects listing/category pages, so products without dedicated pages get nothing
- GTIN/dimensions extraction only works with very specific formatting patterns
- ~3 credits per product with inconsistent results
- Poor quality for a significant percentage of products

### Product Data

Products come from vendor feeds (270+ boutiques). The CSV has 38 columns including product identifiers (sku, code, model), metadata (brand, color, category, department), pricing, images, and the `errors` column listing which fields are missing per product.

### Enrichment Tools

**Core 4** (API keys available):
- Claude (Anthropic) — LLM + Vision, send product data + images
- Gemini (Google) — LLM + Vision, same approach, different model
- FireCrawl — Web search + markdown scraping (replicating current approach)
- Perplexity — Search-augmented LLM

**Stretch 3** (free tiers / trials):
- Apify — Pre-built e-commerce scrapers ($5/mo free credits)
- Zyte — AI-powered extraction (free trial)
- Describely — AI product enrichment SaaS (trial)

## Constraints

- **Tech stack**: TypeScript for enrichment scripts + React/Vite for frontend — unified codebase
- **Budget**: Use free tiers where possible; estimated ~$20-30 for core 4 tools across 500 products
- **Timeline**: Quick validation project — needs to be presentable to client
- **Data**: Must use the provided `originalUnEnrichedProductFeed.csv` as the source of truth

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript for everything | Same language for scripts + React frontend, unified codebase | — Pending |
| LLM tools get images + text | Multi-modal enrichment should produce better descriptions | — Pending |
| Scraping tools search brand sites + Google Shopping | Maximum coverage for finding product pages | — Pending |
| One CSV per tool | Simple comparison, easy to load in React UI | — Pending |
| LocalStorage for scoring | No backend needed for client ratings | — Pending |

---
*Last updated: 2026-03-13 after initialization*

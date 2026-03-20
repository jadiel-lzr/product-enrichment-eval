# Product Enrichment Evaluation

## What This Is

A validation project comparing multiple product data enrichment tools (Claude, Gemini, FireCrawl, Perplexity) on ~500 real luxury fashion products. A TypeScript enrichment pipeline fills missing fields, and a React dashboard lets the client compare results side-by-side with filtering, scoring, and analysis to choose the best enrichment strategy.

## Core Value

The client can visually compare enrichment quality across tools and make an informed decision on which approach to adopt for their product catalog.

## Requirements

### Validated

- ✓ Zod-validated CSV parsing with 498 products after cleaning — v1.0
- ✓ Image preflight and caching (990/995 URLs reachable, 99.5%) — v1.0
- ✓ 4 enrichment adapters (Claude, Gemini, FireCrawl, Perplexity) behind shared interface — v1.0
- ✓ Checkpoint/resume batch runner surviving crashes without re-processing — v1.0
- ✓ Enriched CSV output per tool with enrichment metadata — v1.0
- ✓ React comparison UI with side-by-side cards and color-coded field diffs — v1.0
- ✓ Product browsing with virtual scroll, filtering (brand/category/department/completeness) — v1.0
- ✓ Analysis dashboard with weighted scoring, field winner matrix, completeness metrics — v1.0
- ✓ CSV export for sharing analysis results — v1.0

### Active

- [ ] SerpAPI Google Lens URL discovery for visual product search
- [ ] URL manifest consumable by scraping adapters (FireCrawl)
- [ ] Discovery metadata tracking (match confidence, result count)

### Out of Scope

- Database integration — standalone evaluation, not production pipeline
- Shopify sync — no publishing, just comparison
- Image enrichment (finding better images) — focus is on data fields
- Authentication — internal/demo tool
- Real-time enrichment in UI — enrichment runs as CLI batch
- Automated accuracy scoring — requires ground truth data we don't have

## Context

Shipped v1.0 MVP with 12,086 LOC TypeScript across 2 packages.
Tech stack: TypeScript, React 19, Vite 8, Tailwind v4, Zod v3, Vitest, PapaParse, Sharp.
Enrichment adapters: Anthropic SDK, Google GenAI, FireCrawl JS, OpenAI SDK (Perplexity).
498 enrichable products from vendor feeds (270+ boutiques).
Post-v1.0 work focused on improving enrichment quality for products missing images using web search approaches.

## Constraints

- **Tech stack**: TypeScript for enrichment scripts + React/Vite for frontend — unified codebase
- **Budget**: Use free tiers where possible; estimated ~$20-30 for core 4 tools across 500 products + SerpAPI costs
- **Timeline**: Quick validation project — needs to be presentable to client
- **Data**: Must use the provided `originalUnEnrichedProductFeed.csv` as the source of truth

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript for everything | Same language for scripts + React frontend, unified codebase | ✓ Good |
| LLM tools get images + text | Multi-modal enrichment produces better descriptions | ✓ Good |
| Zod v3 (not v4) | Stable API compatibility with research patterns | ✓ Good |
| EnrichedFieldsSchema .passthrough() | Allows hybrid LLM discovery of extra fields | ✓ Good |
| Image resizer returns Buffer | Adapters encode per their API format (base64 vs inline) | ✓ Good |
| Confidence vs no-confidence ranking tracks | Separates tools with accuracy scores from those without | ✓ Good |
| One CSV per tool | Simple comparison, easy to load in React UI | ✓ Good |
| LocalStorage for scoring | No backend needed for client ratings | ✓ Good |
| Tailwind v4 CSS-first config | @theme directives, no tailwind.config needed | ✓ Good |
| SerpAPI as DETACHED phase | Independent from core pipeline, can be built in parallel | — Pending |

---
*Last updated: 2026-03-19 after v1.0 milestone*

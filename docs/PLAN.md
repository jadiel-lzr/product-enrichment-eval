# Enrichment Evaluation — Implementation Plan

## Background

The `product-middleware` project currently enriches products using a **FireCrawl-based pipeline**:

1. Search for the product via FireCrawl `/v2/search` (1 credit, ~3s)
2. Parse the returned markdown locally with `MarkdownFieldExtractor`
3. Fallback: scrape the URL directly via `/v1/scrape` if markdown parsing yields nothing

**Current limitations:**
- FireCrawl quality is poor for a significant percentage of products
- Markdown parsing depends heavily on page structure — many sites have messy HTML
- Description extraction rejects listing/category pages, so products without dedicated pages get nothing
- GTIN/dimensions extraction only works with very specific formatting patterns
- ~3 credits per product, with inconsistent results

**What works well in the existing system (reuse in this project):**
- Product quality classification: 3-level system (Complete / Acceptable / Incomplete)
- Field classification: required vs desirable vs unenrichable
- Image filtering: rejects logos, icons, tracking pixels, keeps product images
- Search query building: deduplication of brand/name/model/color for search terms
- CSV parsing with PapaParse

---

## Scope

Enrich ~500 products from `originalUnEnrichedProductFeed.csv` using multiple tools,
output one CSV per tool, and present results in a React comparison UI.

### Fields to Enrich

| Field | Type | Notes |
|-------|------|-------|
| `description_eng` | Text | Highest value — product description in English |
| `season` | String | e.g., "FW23", "SS24" |
| `year` | Number | e.g., 2023, 2024 |
| `collection` | String | e.g., "Main", "Pre-Fall" |
| `gtin` | String[] | 13-digit barcode — hard to generate, best found via scraping |
| `dimensions` | String | e.g., "12 x 8 x 4 cm" |

### Enrichment Tools

**Core 4** (have API keys):
1. **Claude** — LLM + Vision (Anthropic API)
2. **Gemini** — LLM + Vision (Google AI API)
3. **FireCrawl** — Web search + markdown scraping
4. **Perplexity** — Search-augmented LLM

**Stretch 3** (need API keys / free tiers):
5. **Apify** — Pre-built e-commerce scrapers ($5/mo free credits)
6. **Zyte** — AI-powered extraction (free trial)

---

## Architecture

```
product-enrichment-eval/
├── data/                          # Output CSVs
│   ├── base.csv                   # Copy of original, normalized
│   ├── enriched-claude.csv
│   ├── enriched-gemini.csv
│   ├── enriched-firecrawl.csv
│   ├── enriched-perplexity.csv
│   ├── enriched-apify.csv         # stretch
│   ├── enriched-zyte.csv          # stretch
├── enrichment/                    # TypeScript enrichment scripts
│   ├── src/
│   │   ├── types.ts               # Product type, EnrichedFields type
│   │   ├── csv.ts                 # Read/write CSV (PapaParse)
│   │   ├── images.ts              # Fetch images, convert to base64 for LLMs
│   │   ├── prompt.ts              # Shared enrichment prompt template
│   │   ├── tools/                 # One adapter per enrichment tool
│   │   │   ├── claude.ts
│   │   │   ├── gemini.ts
│   │   │   ├── firecrawl.ts
│   │   │   ├── perplexity.ts
│   │   │   ├── apify.ts           # stretch
│   │   │   ├── zyte.ts            # stretch
│   │   └── run.ts                 # CLI: run one or all tools
│   ├── .env                       # API keys (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                      # React comparison UI
│   ├── src/
│   │   ├── types.ts               # Shared types
│   │   ├── hooks/
│   │   │   ├── useProducts.ts     # Load & parse CSVs
│   │   │   └── useScoring.ts      # Scoring state (localStorage)
│   │   ├── components/
│   │   │   ├── App.tsx
│   │   │   ├── ProductGrid.tsx    # Side-by-side comparison grid
│   │   │   ├── ProductCard.tsx    # Single product card with enriched data
│   │   │   ├── FilterBar.tsx      # Filter by brand, category, tool, quality
│   │   │   ├── ScoringPanel.tsx   # Rate enrichment quality per tool
│   │   │   ├── ImageGallery.tsx   # Show product images
│   │   │   └── FieldDiff.tsx      # Highlight enriched vs original fields
│   │   └── main.tsx
│   ├── public/
│   │   └── data/                  # Symlink or copy of /data CSVs
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── CONTEXT.md
│   └── PLAN.md                    # This file
├── originalUnEnrichedProductFeed.csv
└── .gitignore
```

---

## Implementation Phases

### Phase 1: Foundation

**Goal:** Shared types, CSV utilities, and project scaffolding.

- [ ] Define `Product` type from CSV columns
- [ ] Define `EnrichedFields` type (the 6 fields we're enriching)
- [ ] Define `EnrichmentResult` type (tool name, enriched fields, metadata)
- [ ] CSV reader: parse `originalUnEnrichedProductFeed.csv` into typed products
- [ ] CSV writer: write enriched results to `data/enriched-{tool}.csv`
- [ ] Image utility: fetch product image from URL, return base64 for LLM vision APIs
- [ ] Shared prompt template for LLM-based tools
- [ ] Project setup: `package.json`, `tsconfig.json`, `.env.example`

**Key decisions:**
- Which columns from the CSV to pass to each tool (all vs minimal)
- Prompt design: how to instruct LLMs to fill exactly the missing fields
- Image handling: first image only, or all available images?

### Phase 2: Core Enrichment Adapters

**Goal:** Implement the 4 core tool adapters.

Each adapter implements the same interface:
```typescript
interface EnrichmentTool {
  name: string;
  enrich(product: Product): Promise<EnrichedFields>;
}
```

- [ ] **Claude adapter** — Anthropic Messages API with vision
  - Send: product data as structured text + first image as base64
  - Prompt: "Fill these missing fields for this product: ..."
  - Parse: structured JSON response with enriched fields

- [ ] **Gemini adapter** — Google Generative AI API with vision
  - Same approach as Claude, different API client

- [ ] **FireCrawl adapter** — Search + markdown parsing
  - Reuse query-building strategy from product-middleware
  - Search via `/v2/search`, parse markdown for fields
  - Fallback: scrape best URL via `/v1/scrape`

- [ ] **Perplexity adapter** — Sonar API (search-augmented)
  - Send product info as context
  - Ask to find and return missing product details
  - Parse structured response

### Phase 3: CLI Runner

**Goal:** Process all 500 products through each tool.

- [ ] CLI entry point: `npx tsx src/run.ts [--tool claude|gemini|firecrawl|perplexity|all]`
- [ ] Concurrency control with `p-limit` (3-5 concurrent per tool)
- [ ] Progress logging: `[Claude] 127/500 — Brand X Product Y — 4/6 fields enriched`
- [ ] Error handling: skip failed products, log errors, continue
- [ ] Output: write `data/enriched-{tool}.csv` on completion
- [ ] Summary report: fields filled %, per-field success rate, errors

### Phase 4: React Comparison UI

**Goal:** Client-facing comparison interface.

- [ ] Vite + React + TypeScript project setup
- [ ] Load all CSVs from `/data` at startup
- [ ] **ProductGrid**: show N cards side by side (one per tool) for selected product
- [ ] **ProductCard**: show product image, name, brand + all enriched fields
  - Highlight fields that were enriched (vs already present)
  - Show "missing" badge for fields the tool couldn't fill
- [ ] **FilterBar**: filter by brand, category, department, enrichment completeness
- [ ] **ScoringPanel**: client can rate each tool's output (1-5 stars) per product
  - Persist scores to localStorage
  - Show aggregate scores per tool
- [ ] **FieldDiff**: visual diff showing original vs enriched value per field
- [ ] **ImageGallery**: show product images (from feed + any new ones from enrichment)
- [ ] Navigation: product list/selector to browse all 500 products

### Phase 5: Stretch Tool Adapters

**Goal:** Add Apify and Zyte adapters.

- [ ] **Apify adapter** — Use e-commerce scraping Actor via REST API
  - Search brand + product name on relevant marketplaces
  - Extract structured product data from results

- [ ] **Zyte adapter** — AI extraction API
  - Submit product page URLs (found via search)
  - Use AI extraction for structured product fields

### Phase 6: Polish & Present

**Goal:** Final cleanup for client presentation.

- [ ] Generate aggregate comparison report (CSV or in-UI)
  - Per-tool: % fields filled, avg quality score, best/worst categories
- [ ] Style the React UI for client presentation (clean, professional)
- [ ] Add export: download scoring results as CSV
- [ ] README with setup instructions

---

## Enrichment Strategy Per Tool

### LLM Tools (Claude, Gemini)

**Input:** Product data (name, brand, color, model, category, materials, season info) + first available image as base64.

**Prompt strategy:**
```
You are a product data specialist for luxury fashion e-commerce.
Given the following product information and image, fill in the missing fields.

Product: { ...known fields }
Missing fields: [description_eng, season, year, collection, gtin, dimensions]

Rules:
- description_eng: Write a professional product description in English (2-3 sentences)
- season: Format as "FW" or "SS" (Fall/Winter or Spring/Summer)
- year: 4-digit year
- collection: Collection name if identifiable
- gtin: Only if you can identify the exact barcode (otherwise leave empty)
- dimensions: Physical dimensions if visible or inferable
- Only fill fields you are confident about. Leave empty rather than guess.

Respond as JSON: { "description_eng": "...", "season": "...", ... }
```

### Search Tools (Perplexity)

**Input:** Product identification (brand + name + model + color).

**Strategy:** Ask Perplexity to search for the product and return structured data. The search-augmented approach should find real product pages and extract accurate data.

### Scraping Tools (FireCrawl, Apify, Zyte)

**Input:** Search query built from brand + name + model + color + category.

**Strategy:**
1. Search for product (brand site first, then Google Shopping)
2. Get product page URL
3. Extract/parse structured fields from page content
4. Return extracted fields

---

## Data Format

### Base CSV Columns (from originalUnEnrichedProductFeed.csv)

```
sku, code, gtin, name, brand, color, model, price, sizes, errors,
images, season, made_in, category, feed_name, department, product_id,
season_year, color_original, made_in_original, category_original,
materials_original, department_original, unit_system_name_original,
year, collection, dimensions, collection_original, title, sizes_raw,
season_raw, description, size_system, category_item, season_display,
sizes_original, vendor_product_id
```

### Enriched CSV Format

Same columns as base, plus:
```
_enriched_fields     — comma-separated list of fields that were enriched
_enrichment_tool     — tool name (claude, gemini, firecrawl, perplexity, etc.)
_enrichment_status   — success | partial | failed
_enrichment_error    — error message if failed
```

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM hallucination | Bad data presented to client | Prompt: "leave empty rather than guess" + visual diff in UI |
| API rate limits | Slow processing | Concurrency control, process overnight if needed |
| API costs | Budget overrun | Track credits per tool, set limits |
| Image URLs broken | Can't send to vision LLMs | Graceful fallback: enrich without image |
| GTIN impossible to generate | Low fill rate for this field | Expected — scraping tools better here |
| 500 products × 4-7 tools | Long processing time | Parallel tool runs, resume capability |

---

## Estimated API Costs (500 products)

| Tool | Est. Cost | Notes |
|------|-----------|-------|
| Claude | ~$5-10 | ~$0.01-0.02 per product (text + image) |
| Gemini | ~$2-5 | Generally cheaper than Claude |
| FireCrawl | ~1500 credits | ~3 credits per product |
| Perplexity | ~$5-10 | Depends on plan |
| Apify | ~$5 free tier | May cover 500 products |
| Zyte | Free trial | Limited requests |

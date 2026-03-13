# Product Enrichment Eval — Architecture & Reference

## Overview

This repository evaluates and benchmarks four enrichment tools on ~500 luxury fashion products, generating client-ready comparison reports. The system enriches product data using LLMs and web scraping, then provides a React dashboard for side-by-side analysis.

```
┌─────────────────────────────────────────────────────────────┐
│                        data/                                │
│  base.csv ──► enrichment pipeline ──► enriched-{tool}.csv   │
│                                            │                │
│                                    frontend dashboard       │
│                                   (compare & analyze)       │
└─────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
product-enrichment-eval/
├── enrichment/                 # Node.js backend pipeline
│   └── src/
│       ├── adapters/           # Tool-specific enrichment adapters
│       │   ├── claude-adapter.ts
│       │   ├── gemini-adapter.ts
│       │   ├── firecrawl-adapter.ts
│       │   ├── perplexity-adapter.ts
│       │   ├── litellm.ts      # LiteLLM proxy routing
│       │   └── types.ts        # Shared adapter interfaces
│       ├── batch/              # Batch processing engine
│       │   ├── runner.ts       # Concurrent product processing
│       │   ├── checkpoint.ts   # Resumable run state
│       │   ├── report.ts       # Run statistics
│       │   └── retry.ts        # Retry with backoff
│       ├── cleaning/           # Data normalization
│       │   ├── cleaner.ts
│       │   ├── filters.ts      # Test product removal
│       │   └── normalizers.ts  # Color/title normalization
│       ├── images/             # Image pipeline
│       │   ├── preflight.ts    # URL reachability check
│       │   ├── downloader.ts   # Parallel image download
│       │   ├── resizer.ts      # Resize for LLM input
│       │   └── manifest.ts     # Image metadata tracking
│       ├── parsers/            # CSV I/O
│       │   ├── csv-reader.ts
│       │   └── csv-writer.ts
│       ├── prompts/
│       │   └── enrichment-prompt.ts  # LLM prompt builder
│       ├── scripts/            # CLI entry points
│       │   ├── enrich.ts       # Main enrichment runner
│       │   ├── parse-and-clean.ts
│       │   └── cache-images.ts
│       └── types/
│           ├── product.ts      # Product schema (40+ fields)
│           ├── enriched.ts     # Target fields & enriched schema
│           └── index.ts        # Shared exports for frontend
├── frontend/                   # React + Vite dashboard
│   └── src/
│       ├── components/
│       │   ├── comparison/     # Side-by-side enrichment view
│       │   └── analysis/       # Aggregated reporting view
│       ├── context/
│       │   └── ProductContext.tsx
│       ├── hooks/
│       │   ├── useProductData.ts
│       │   ├── useUrlParams.ts
│       │   └── useAnalysisState.ts
│       ├── lib/
│       │   ├── analysis/       # Scoring, weights, export
│       │   └── csv-loader.ts   # Loads enriched CSVs
│       └── types/
│           └── enrichment.ts   # Frontend type extensions
├── data/                       # Input/output data
│   ├── base.csv                # Cleaned source products (~500)
│   ├── enriched-{tool}.csv     # Per-tool enrichment output
│   ├── image-manifest.json     # Image metadata
│   ├── images/                 # Downloaded product images
│   ├── checkpoints/            # Resumable run state
│   └── reports/                # Run statistics JSON
└── docs/                       # Documentation
```

---

## Enrichment Target Fields

The pipeline enriches **11 fields** per product, categorized by confidence strategy:

### Factual Fields (leave blank if uncertain)

| Field | Description |
|-------|-------------|
| `gtin` | Global Trade Item Number (barcode) |
| `dimensions` | Physical dimensions (e.g., "30x20x10cm") |
| `year` | Product year |
| `weight` | Product weight |

### Generative Fields (always attempt to fill)

| Field | Description |
|-------|-------------|
| `description_eng` | Luxury e-commerce copy, 2-3 sentences (NET-A-PORTER style) |
| `season` | Season name (e.g., "Fall Winter 2023") |
| `collection` | Collection name |
| `materials` | Material composition |
| `made_in` | Country of manufacture |
| `color` | Normalized color name (e.g., "BLK" → "Black"), verified against product images |
| `additional_info` | Supplementary details: care instructions, design features, construction details (1-2 sentences) |

Each enrichment also returns an `accuracy_score` (integer 1-10) representing overall confidence.

---

## Enrichment Tools

### Claude (Vision LLM)

| Property | Value |
|----------|-------|
| SDK | `@anthropic-ai/sdk` |
| Default model | `claude-haiku-4-5-20250415` |
| Model env var | `CLAUDE_MODEL` |
| API key env var | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` |
| Supports images | Yes (base64, placed before text in message) |
| Output format | Structured JSON via `json_schema` output config |
| Concurrency | 3 |

### Gemini (Vision LLM)

| Property | Value |
|----------|-------|
| SDK | `@google/genai` |
| Default model | `gemini-2.5-flash` |
| Model env var | `GEMINI_MODEL` |
| API key env var | `GOOGLE_GENAI_API_KEY` or `GEMINI_API_KEY` |
| Supports images | Yes (inline data parts) |
| Output format | `responseMimeType: 'application/json'` + `responseJsonSchema` |
| Concurrency | 5 |

### FireCrawl (Web Scraping)

| Property | Value |
|----------|-------|
| SDK | `@mendable/firecrawl-js` |
| API key env var | `FIRECRAWL_API_KEY` |
| Supports images | No |
| Concurrency | 2 |

**Workflow:**
1. Identifies which target fields are already filled on the product
2. If all filled → returns early (no API call)
3. Checks `data/serpapi-urls.json` for pre-discovered URLs
4. Falls back to FireCrawl search (`brand + name + model`, limit 3 results)
5. Picks best URL (prefers brand-domain matches, avoids Google Shopping)
6. If no results → falls back to Google Shopping site-specific search
7. Scrapes picked URL with JSON extraction targeting only missing fields

### Perplexity (Search-Augmented LLM)

| Property | Value |
|----------|-------|
| SDK | `openai` (compatible API) |
| Default model | `sonar-pro` |
| Model env var | `PERPLEXITY_MODEL` |
| API key env var | `PERPLEXITY_API_KEY` |
| Base URL | `https://api.perplexity.ai` (configurable via `PERPLEXITY_BASE_URL`) |
| Supports images | No |
| Output format | `json_schema` response format |
| Concurrency | 3 |
| Special behavior | Strips `accuracy_score` (not a vision model), has regex-based JSON extraction fallback for free-text responses |

### LiteLLM Proxy (Optional)

Both Claude and Gemini can be routed through a LiteLLM proxy for cost optimization or centralized API management.

| Env var | Effect |
|---------|--------|
| `CLAUDE_BASE_URL` | Routes Claude through LiteLLM |
| `GEMINI_BASE_URL` | Routes Gemini through LiteLLM |
| `LITELLM_BASE_URL` | Fallback for both tools |
| `LITELLM_API_KEY` | API key for the proxy |

When LiteLLM is active, adapters use the OpenAI SDK with the proxy's base URL instead of native SDKs. Image content is converted to OpenAI-compatible `image_url` parts with base64 data URIs.

---

## Running Enrichment

### Prerequisites

Create a `.env` file in `enrichment/` with API keys:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENAI_API_KEY=AI...
FIRECRAWL_API_KEY=fc-...
PERPLEXITY_API_KEY=pplx-...
```

### Commands

All commands are run from the `enrichment/` directory.

#### Prepare data (one-time setup)

```bash
# 1. Parse and clean raw product feed → data/base.csv
npm run parse-and-clean

# 2. Check image URLs and download locally → data/images/
npm run cache-images
```

#### Run enrichment

```bash
# Single tool
npx tsx src/scripts/enrich.ts --tool claude
npx tsx src/scripts/enrich.ts --tool gemini
npx tsx src/scripts/enrich.ts --tool firecrawl
npx tsx src/scripts/enrich.ts --tool perplexity

# All tools (runs sequentially: claude → gemini → firecrawl → perplexity)
npx tsx src/scripts/enrich.ts --tool all

# Limit to N products (useful for testing)
npx tsx src/scripts/enrich.ts --tool claude --limit 5
```

### Tool Execution Order

When using `--tool all`, tools run **sequentially** in this order:

```
1. claude    (concurrency: 3)
2. gemini    (concurrency: 5)
3. firecrawl (concurrency: 2)
4. perplexity (concurrency: 3)
```

Each tool fully completes before the next starts. Tools write to independent output files and checkpoints, so there is no data dependency between them.

### Progress Logging

Each product logs as it completes:

```
[claude] 1/500 SKU-85993 → partial (9 fields)
[claude] 2/500 SKU-86001 → success (11 fields)
...
[claude] Complete: 412 success, 85 partial, 3 failed (8m 32s)
```

### Resumable Runs

Runs are **checkpoint-based**. If interrupted, re-running the same command resumes from where it left off:

```
[claude] Resuming: 250 already done, 250 remaining
```

Checkpoints are stored in `data/checkpoints/checkpoint-{tool}.json`. Delete a checkpoint file to force a full re-run for that tool.

---

## Data Pipeline

### Input

**`data/base.csv`** — Cleaned product feed with ~500 luxury fashion items.

Key product fields:

| Field | Description |
|-------|-------------|
| `sku` | Unique product identifier |
| `brand` | Brand name (e.g., "Gucci", "Hermes") |
| `name` | Product name |
| `model` | Model identifier |
| `color` / `color_original` | Current and original color values |
| `category` / `department` | Product classification |
| `images` | JSON array of image URLs |
| `materials_original` | Raw materials text |
| `made_in` / `made_in_original` | Country of origin |
| `season` / `year` / `collection` | Temporal classification |
| `gtin` | JSON array of barcodes |
| `sizes` | JSON array of size/price entries |
| `errors` | JSON array of validation errors |
| `_missing_fields` | Count of empty required fields |
| `_has_images` / `_image_count` | Image availability metadata |

### Image Pipeline

1. **Preflight** (`cache-images`): HEAD requests to check image URL reachability (10 concurrent, retry once)
2. **Download**: Fetches reachable images to `data/images/{sku}_{index}.{ext}` (10 concurrent)
3. **Manifest**: Writes `data/image-manifest.json` with status per image
4. **At enrichment time**: Images resized to max 1024px edge, JPEG quality 85, sent as base64 to vision LLMs (Claude, Gemini)

### Output

**Per tool:** `data/enriched-{tool}.csv`

Each row contains the original product fields plus:

| Column | Description |
|--------|-------------|
| `description_eng` | Enriched English description |
| `season` | Enriched season |
| `year` | Enriched year |
| `collection` | Enriched collection |
| `gtin` | Enriched GTIN |
| `dimensions` | Enriched dimensions |
| `made_in` | Enriched country of origin |
| `materials` | Enriched materials |
| `weight` | Enriched weight |
| `color` | Enriched/normalized color |
| `additional_info` | Supplementary product details |
| `accuracy_score` | LLM confidence (1-10, vision tools only) |
| `_enrichment_tool` | Tool name |
| `_enrichment_status` | `success` / `partial` / `failed` |
| `_enrichment_fill_rate` | 0-1, fraction of target fields filled |
| `_enriched_fields` | Comma-separated list of populated fields |
| `_enrichment_error` | Error message (if failed) |
| `_enrichment_accuracy_score` | Accuracy score as string |

**Run reports:** `data/reports/run-report-{tool}.json`

Contains: total/success/partial/failed counts, average fill rate, per-field fill rates, duration, error list.

---

## Enrichment Prompt

The prompt sent to vision LLMs (Claude, Gemini) follows this structure:

1. **Product Identity** — Brand, Name, Model, Color, Category, Department
2. **Existing Context** — Current field values marked "confirm or improve" (season, year, collection, made_in, materials, dimensions, gtin, color)
3. **Target Fields** — Lists all 11 fields + accuracy_score
4. **Confidence Strategy** — Factual fields: leave blank if uncertain. Generative fields: always attempt
5. **Description Tone** — Luxury e-commerce copy (NET-A-PORTER / SSENSE style)
6. **Color Guidelines** — Normalize abbreviations, verify against images
7. **Additional Info Guidelines** — Care instructions, design features, 1-2 sentences
8. **Output Format** — Pure JSON, no markdown wrapping

---

## Frontend Dashboard

### Setup

```bash
cd frontend

# Copy enriched CSVs from data/ to frontend public/data/
npm run copy-data

# Start dev server
npm run dev

# Production build
npm run build
```

### Shared Types

The frontend imports types directly from the enrichment package via path alias:

```
@shared/* → ../enrichment/src/types/*
```

This ensures `Product`, `EnrichedFields`, and `ENRICHMENT_TARGET_FIELDS` stay in sync between backend and frontend.

### Two Modes

#### 1. Comparison Mode

Side-by-side view of enrichment results for a single product across all tools.

**Components:**
- **ProductSidebar** — Filterable product list (search by brand/name/SKU, filter by brand/category/department)
- **ProductHeader** — Product images, SKU, brand, name, model
- **EnrichmentCard** (per tool) — Status badge, accuracy score, enriched field values with diff highlighting
- **FieldRow** — Original vs. enriched value comparison per field
- **OriginalDataSection** — Current product state

#### 2. Analysis Mode

Aggregated comparison dashboard across all products.

**Components:**
- **ExecutiveSummary** — Key metrics and auto-generated takeaways
- **WeightControls** — Preset selector (Balanced / Accuracy First / Completeness First) with manual per-field weight overrides
- **FieldWinnerMatrix** — Per-field tool rankings (which tool enriches each field best)
- **CompletenessSection** — Fill rate heatmap by tool and field
- **ExportButton** — CSV export of analysis results

### Weight Presets

Analysis scores are weighted by field importance:

| Preset | Focus | Example weights |
|--------|-------|-----------------|
| **Balanced** | Equal weighting | All fields = 1.0 |
| **Accuracy First** | Compliance-sensitive fields | description_eng: 1.4, gtin: 1.3, materials: 1.2 |
| **Completeness First** | Broad catalog coverage | season/year/collection: 1.2, dimensions/made_in: 1.1 |

### Score Tracks

Products are split into two scoring tracks:

- **Confidence track** — Products where the tool returned an `accuracy_score` (vision LLMs)
- **No-confidence track** — Products without accuracy scores (FireCrawl, Perplexity)

This prevents unfair comparison between tools that self-report confidence and those that don't.

### Data Loading

The frontend loads CSVs at startup:

1. `base.csv` → Product objects
2. `enriched-{tool}.csv` for each available tool → `ToolEnrichment` objects
3. Enrichments grouped by SKU into `Map<sku, ToolEnrichment[]>`

URL parameters persist selected product and filters across page loads (`?product={sku}&brand=...&category=...`).

---

## Environment Variables Reference

### Required

| Variable | Tool | Description |
|----------|------|-------------|
| `ANTHROPIC_API_KEY` | Claude | Anthropic API key |
| `GOOGLE_GENAI_API_KEY` | Gemini | Google AI API key |
| `FIRECRAWL_API_KEY` | FireCrawl | FireCrawl API key |
| `PERPLEXITY_API_KEY` | Perplexity | Perplexity API key |

### Optional (model overrides)

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MODEL` | `claude-haiku-4-5-20250415` | Claude model ID |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model ID |
| `PERPLEXITY_MODEL` | `sonar-pro` | Perplexity model ID |

### Optional (LiteLLM proxy)

| Variable | Description |
|----------|-------------|
| `CLAUDE_BASE_URL` | LiteLLM proxy URL for Claude |
| `GEMINI_BASE_URL` | LiteLLM proxy URL for Gemini |
| `LITELLM_BASE_URL` | Fallback proxy URL for both |
| `LITELLM_API_KEY` | Proxy API key |
| `CLAUDE_API_KEY` | Alternative Claude key (checked before `ANTHROPIC_API_KEY`) |
| `GEMINI_API_KEY` | Alternative Gemini key (checked before `GOOGLE_GENAI_API_KEY`) |
| `PERPLEXITY_BASE_URL` | Override Perplexity endpoint |

### API Key Resolution Order

**Claude:** `CLAUDE_API_KEY` → `LITELLM_API_KEY` → `ANTHROPIC_API_KEY`
**Gemini:** `GEMINI_API_KEY` → `LITELLM_API_KEY` → `GOOGLE_GENAI_API_KEY`

---

## Testing

```bash
# Enrichment tests (175 tests)
cd enrichment && npm test

# With coverage
npm run test:coverage

# Type check
npm run typecheck

# Frontend build (includes tsc type check)
cd frontend && npm run build
```

Test coverage spans: adapter behavior, schema validation, fill rate calculation, prompt construction, batch processing, checkpoint resume, CSV parsing, image resizing, cleaning/normalization, and report generation.

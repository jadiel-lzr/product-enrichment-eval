# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Evaluation project comparing product data enrichment tools (Claude, Gemini, FireCrawl, GPT) on ~500 luxury fashion products. A TypeScript enrichment pipeline fills missing fields, and a React dashboard lets the client compare results side-by-side.

**Two independent packages** with separate `node_modules`:
- `enrichment/` — Node.js data pipeline (TypeScript, ESM, Node >= 25)
- `frontend/` — React + Vite dashboard (React 19, Tailwind v4, Vite 8)

Shared types live in `enrichment/src/types/` and are imported by the frontend via the `@shared/*` path alias.

## Commands

### Enrichment (run from `enrichment/`)

```bash
npm test                                    # vitest run (204 tests)
npm run test:coverage                       # vitest with coverage
npm run typecheck                           # tsc --noEmit
npx tsx src/scripts/enrich.ts --tool claude # run single tool enrichment
npx tsx src/scripts/enrich.ts --tool all    # run all tools sequentially
npx tsx src/scripts/enrich.ts --tool claude --limit 5  # test with few products
npm run enrich:llm                          # claude + gemini + gpt (skip firecrawl)
npm run parse-and-clean                     # one-time: raw CSV → data/base.csv
npm run cache-images                        # one-time: download product images
```

Python venv (for Google Lens link picker):
```bash
npm run python:setup                        # create .venv, install deps, playwright
npm run pick-best-links                     # runs pick_best_links.py
```

### Frontend (run from `frontend/`)

```bash
npm run copy-data    # copies data/*.csv and data/images/ → public/
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run test         # vitest
```

## Architecture

### Data Flow

```
originalUnEnrichedProductFeed.csv
    → parse-and-clean → data/base.csv
    → cache-images → data/images/ + image-manifest.json
    → enrich.ts --tool {name} → data/enriched-{tool}.csv + data/checkpoints/ + data/reports/
    → frontend loads CSVs from public/data/
```

### Enrichment Pipeline

Each tool implements the `EnrichmentAdapter` interface (`enrichment/src/adapters/types.ts`). The batch runner (`enrichment/src/batch/runner.ts`) processes products concurrently with tool-specific limits, checkpointing after each product for resume support.

**Adapter pattern:** Claude, Gemini, GPT use a shared LLM prompt (`enrichment/src/prompts/enrichment-prompt.ts`) with product data + images + Google Lens context. FireCrawl uses its own web-scraping strategy with multi-layered URL discovery (lens URLs → search → Google Shopping fallback).

**LiteLLM proxy:** All LLM adapters can optionally route through a LiteLLM proxy via `*_BASE_URL` env vars. When active, they use the OpenAI SDK instead of native SDKs.

### Enrichment Target Fields (12)

- **Factual** (leave blank if uncertain): title, gtin, dimensions, year, weight
- **Generative** (always attempt): description_eng, season, collection, materials, made_in, color, additional_info

Each enrichment also returns `accuracy_score` (1-10).

### Frontend

Two modes sharing a sidebar with filters:
- **Comparison** — Side-by-side enrichment cards for a single product across tools
- **Analysis** — Aggregated scoring with weight presets and field winner matrix

State: `ProductContext` holds loaded products/enrichments. URL params persist product selection and filters. Analysis uses weighted scoring with confidence/no-confidence tracks.

### Shared Types

Frontend imports from enrichment via path aliases:
- `@shared/*` → `../enrichment/src/types/*` (Vite alias + tsconfig paths)
- `@/*` → `./src/*` (frontend-internal)

Changing types in `enrichment/src/types/` affects both packages.

## Key Conventions

- **ESM throughout** — both packages use `"type": "module"`
- **Zod for schemas** — enrichment uses Zod v3, frontend uses Zod v4
- **Vitest for testing** — both packages, `globals: false` (explicit imports)
- **CSV as data interchange** — no database; enriched CSVs in `data/`, copied to `frontend/public/` for the dashboard
- **Checkpoints for resume** — `data/checkpoints/checkpoint-{tool}.json`; delete to force re-run
- **Images resized at enrichment time** — max 1024px edge, JPEG quality 85, sent as base64
- **Google Lens data** — pre-computed in `base.csv` as JSON strings (`lens_brand_matches`, `lens_all_matches`), parsed on demand by `enrichment/src/lens/`

## Environment Variables

API keys go in `enrichment/.env`:
- `ANTHROPIC_API_KEY` / `GOOGLE_GENAI_API_KEY` / `FIRECRAWL_API_KEY` / `OPENAI_API_KEY`
- Optional model overrides: `CLAUDE_MODEL`, `GEMINI_MODEL`, `GPT_MODEL`
- Optional LiteLLM: `CLAUDE_BASE_URL`, `GEMINI_BASE_URL`, `GPT_BASE_URL`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`

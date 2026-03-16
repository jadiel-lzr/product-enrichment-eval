# Testing Guide

This guide covers testing for both the enrichment pipeline and the frontend comparison dashboard.

---

## Part 1: Enrichment Pipeline

### What You Are Testing

The enrichment CLI lives at `enrichment/src/scripts/enrich.ts`.

It supports:

- `claude`
- `gemini`
- `firecrawl`
- `gpt`
- `all`
- `all-llm` (claude + gemini + gpt, skips firecrawl)

Outputs are written to:

- `data/enriched-{tool}.csv`
- `data/reports/run-report-{tool}.json`
- `data/checkpoints/checkpoint-{tool}.json`

### 1. Install Dependencies

```bash
cd enrichment
npm install
```

### 2. Set the Required API Keys

The script auto-loads `enrichment/.env` if it exists. Copy the example and fill in your keys:

```bash
cp enrichment/.env.example enrichment/.env
```

Then edit `enrichment/.env` with the keys for the tools you want to test:

```env
ANTHROPIC_API_KEY=your-key-here
GOOGLE_GENAI_API_KEY=your-key-here
FIRECRAWL_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here

# Optional model overrides
CLAUDE_MODEL=claude-haiku-4-5-20250415
GEMINI_MODEL=gemini-2.5-flash
GPT_MODEL=gpt-5.2

# LiteLLM proxy (alternative to direct API keys)
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=your-litellm-key
```

You only need the key for the tool you plan to test. When using LiteLLM, prefix the model name with the provider (e.g. `GPT_MODEL=openai/gpt-5.2`).

### 3. Prepare Input Data

Before running enrichment, you need the cleaned product feed and cached images:

```bash
cd enrichment

# Parse and clean the raw product feed into data/base.csv
npm run parse-and-clean

# Check image URLs and download locally into data/images/
npm run cache-images
```

Verify the data exists:

```bash
ls data/base.csv data/image-manifest.json data/images/
```

These only need to run once. Re-run `cache-images` if you add new products or if image URLs change.

### 4. Run the Safe Local Checks First

This verifies the code without spending API credits:

```bash
cd enrichment
npx vitest run --reporter=verbose
npx tsc --noEmit
npx tsx src/scripts/enrich.ts
```

Expected results:

- tests pass
- TypeScript passes
- the last command prints usage

You can also confirm invalid tool handling:

```bash
npx tsx src/scripts/enrich.ts --tool invalid
```

### 5. Remove Old Outputs Before a Fresh Run

If you want a clean test, delete the old checkpoint, CSV, and report for that tool first.

Example for Claude:

```bash
rm -f data/checkpoints/checkpoint-claude.json
rm -f data/enriched-claude.csv
rm -f data/reports/run-report-claude.json
```

This matters because the runner supports resume. If the checkpoint exists, it will skip already completed SKUs. Failed SKUs are always retried on the next run.

### 6. Run a Single Tool

Testing one tool at a time is the right starting point. It is cheaper, easier to debug, and isolates provider-specific failures.

Use `--limit N` to process only the first N products:

```bash
cd enrichment
npx tsx src/scripts/enrich.ts --tool claude --limit 5
```

#### Claude

```bash
npx tsx src/scripts/enrich.ts --tool claude
```

#### Gemini

```bash
npx tsx src/scripts/enrich.ts --tool gemini
```

#### GPT

```bash
npx tsx src/scripts/enrich.ts --tool gpt
```

#### FireCrawl

```bash
npx tsx src/scripts/enrich.ts --tool firecrawl
```

Expected console behavior:

- startup log like `[tool] Starting: N products`
- periodic progress logs
- final summary like `[tool] Complete: X success, Y partial, Z failed (duration)`

### 7. Validate the Output Files

After a successful run, confirm these files exist:

```bash
ls data/enriched-claude.csv
ls data/reports/run-report-claude.json
ls data/checkpoints/checkpoint-claude.json
```

Inspect the report:

```bash
cat data/reports/run-report-claude.json
```

You should see:

- `totalProducts`
- `success`
- `partial`
- `failed`
- `averageFillRate`
- `fieldFillRates`
- `errors`

Inspect the CSV header:

```bash
head -2 data/enriched-claude.csv
```

Look for these metadata columns:

- `_enrichment_tool`
- `_enrichment_status`
- `_enrichment_fill_rate`
- `_enriched_fields`
- `_enrichment_error`
- `_enrichment_accuracy_score`

### 8. Test Resume Behavior

The runner resumes from checkpoint without reprocessing finished SKUs. Failed SKUs are retried automatically.

Step by step:

1. Start a live run for one tool.
2. Stop it partway through with `Ctrl+C`.
3. Confirm the checkpoint file exists.
4. Run the same command again.

Expected behavior on rerun:

- log like `[claude] Resuming: X already done, Y remaining`
- completed and partial SKUs are skipped
- failed SKUs are retried
- final CSV still includes resumed rows

### 9. Test All Tools Sequentially

Only do this after single-tool runs look healthy.

```bash
cd enrichment
# All tools (claude, gemini, firecrawl, gpt)
npx tsx src/scripts/enrich.ts --tool all

# LLM tools only (claude, gemini, gpt — skips firecrawl)
npm run enrich:llm
```

### 10. Common Failure Cases

#### Missing API key

Symptom: auth or client initialization error.

Fix: export the correct provider key and rerun.

#### Old checkpoint causes unexpected skipping

Symptom: runner says products are already done when you expected a fresh run.

Fix: delete that tool's checkpoint file before rerunning.

#### Missing cached images

Symptom: LLM tools still run, but image-backed enrichment is incomplete.

Fix: rerun `npm run cache-images`.

#### Missing base.csv or image-manifest.json

Symptom: script fails at startup with file not found.

Fix: run `npm run parse-and-clean` then `npm run cache-images`.

#### Provider returns partial or failed rows

This is expected sometimes, especially with rate limits, scraping misses, or incomplete source data. Check the JSON report's `errors` field and the CSV metadata columns.

---

## Part 2: Frontend Dashboard

### What You Are Testing

The frontend is a React + Vite app at `frontend/` that renders the comparison dashboard for enrichment results.

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Copy Enrichment Data

The frontend reads CSV data from `frontend/public/data/`. Copy the enrichment outputs:

```bash
cd frontend
npm run copy-data
```

### 3. Run Unit Tests

```bash
cd frontend
npm test
```

This runs all Vitest tests under `frontend/src/`.

### 4. Type Check

```bash
cd frontend
npx tsc -b
```

### 5. Lint

```bash
cd frontend
npm run lint
```

### 6. Dev Server

Start the development server to manually verify the UI:

```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.

Things to check:

- Product sidebar loads with all products
- Selecting a product shows the comparison view
- Each enrichment tool card displays fields and fill rate
- Analysis mode toggle works
- Responsive layout: sidebar becomes a drawer on tablet, bottom sheet on mobile

### 7. Production Build

Verify the production build completes without errors:

```bash
cd frontend
npm run build
```

Preview it locally:

```bash
cd frontend
npm run preview
```

### 8. Generate Mock Data

If you need mock data for frontend development without running enrichment:

```bash
cd frontend
npm run generate-mocks
```

---

## Quick Reference

```bash
# Enrichment: prepare data (one-time)
cd enrichment
npm run parse-and-clean
npm run cache-images

# Enrichment: local checks (free)
npx vitest run --reporter=verbose
npx tsc --noEmit

# Enrichment: smoke test (5 products)
npx tsx src/scripts/enrich.ts --tool claude --limit 5

# Enrichment: full runs
npx tsx src/scripts/enrich.ts --tool claude
npx tsx src/scripts/enrich.ts --tool gemini
npx tsx src/scripts/enrich.ts --tool gpt
npx tsx src/scripts/enrich.ts --tool firecrawl
npx tsx src/scripts/enrich.ts --tool all
npm run enrich:llm  # claude + gemini + gpt (no firecrawl)

# Frontend: local checks
cd frontend
npm test
npx tsc -b
npm run lint

# Frontend: dev server
npm run dev

# Frontend: production build
npm run build
npm run preview
```

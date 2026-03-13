# Testing the Enrichment Tools

This guide shows how to test the enrichment pipeline step by step, from local verification to live runs against each provider.

## What You Are Testing

The enrichment CLI lives at [`enrichment/src/scripts/enrich.ts`](/Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment/src/scripts/enrich.ts).

It supports:

- `claude`
- `gemini`
- `firecrawl`
- `perplexity`
- `all`

Outputs are written to:

- `data/enriched-{tool}.csv`
- `data/reports/run-report-{tool}.json`
- `data/checkpoints/checkpoint-{tool}.json`

## 1. Install Dependencies

From the repo root:

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npm install
```

## 2. Confirm the Input Data Exists

These files should already exist before you run live enrichment:

- `/Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/base.csv`
- `/Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/image-manifest.json`
- `/Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/images/`

Quick check:

```bash
ls /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data
```

If any of those are missing, build them first:

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npm run parse-and-clean
npm run cache-images
```

## 3. Set the Required API Key

Use only the key for the tool you want to test.

### Claude

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### Gemini

```bash
export GOOGLE_GENAI_API_KEY="your-key-here"
```

### FireCrawl

```bash
export FIRECRAWL_API_KEY="your-key-here"
```

### Perplexity

```bash
export PERPLEXITY_API_KEY="your-key-here"
```

Optional model overrides:

```bash
export CLAUDE_MODEL="claude-haiku-4-5-20250415"
export GEMINI_MODEL="gemini-2.5-flash"
export PERPLEXITY_MODEL="sonar-pro"
```

## 4. Run the Safe Local Checks First

This verifies the code without spending API credits:

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
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
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool invalid
```

## 5. Remove Old Outputs Before a Fresh Run

If you want a clean test, delete the old checkpoint, CSV, and report for that tool first.

Example for Claude:

```bash
rm -f /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/checkpoints/checkpoint-claude.json
rm -f /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/enriched-claude.csv
rm -f /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/reports/run-report-claude.json
```

This matters because the runner supports resume. If the checkpoint exists, it will skip already completed SKUs.

## 6. Run a Single Tool

Testing one tool at a time is the right starting point. It is cheaper, easier to debug, and isolates provider-specific failures.

### Claude

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool claude
```

### Gemini

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool gemini
```

### FireCrawl

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool firecrawl
```

### Perplexity

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool perplexity
```

Expected console behavior:

- startup log like `[tool] Starting: N products`
- periodic progress logs
- final summary like `[tool] Complete: X success, Y partial, Z failed (duration)`

## 7. Validate the Output Files

After a successful run, confirm these files exist:

### Claude example

```bash
ls /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/enriched-claude.csv
ls /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/reports/run-report-claude.json
ls /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/checkpoints/checkpoint-claude.json
```

Inspect the report:

```bash
cat /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/reports/run-report-claude.json
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
head -2 /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/data/enriched-claude.csv
```

Look for these metadata columns:

- `_enrichment_tool`
- `_enrichment_status`
- `_enrichment_fill_rate`
- `_enriched_fields`
- `_enrichment_error`
- `_enrichment_accuracy_score`

## 8. Test Resume Behavior

The runner is supposed to resume from checkpoint without reprocessing finished SKUs.

Step by step:

1. Start a live run for one tool.
2. Stop it partway through with `Ctrl+C`.
3. Confirm the checkpoint file exists.
4. Run the same command again.

Example:

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool claude
```

Then rerun:

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool claude
```

Expected behavior on rerun:

- log like `[claude] Resuming: X already done, Y remaining`
- completed SKUs are skipped
- final CSV still includes resumed rows

## 9. Test All Tools Sequentially

Only do this after single-tool runs look healthy.

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx tsx src/scripts/enrich.ts --tool all
```

This runs:

1. `claude`
2. `gemini`
3. `firecrawl`
4. `perplexity`

Use this when you want the complete comparison dataset, not when debugging one provider.

## 10. Common Failure Cases

### Missing API key

Symptom: auth or client initialization error.

Fix: export the correct provider key and rerun.

### Old checkpoint causes unexpected skipping

Symptom: runner says products are already done when you expected a fresh run.

Fix: delete that tool’s checkpoint file before rerunning.

### Missing cached images

Symptom: LLM tools still run, but image-backed testing is incomplete.

Fix: rerun `npm run cache-images`.

### Provider returns partial or failed rows

Common sense: this is expected sometimes, especially with rate limits, scraping misses, or incomplete source data.

Check the JSON report’s `errors` field and the CSV metadata columns.

## 11. Recommended Test Order

If you want the shortest path with the least waste:

1. `npx vitest run --reporter=verbose`
2. `npx tsc --noEmit`
3. `npx tsx src/scripts/enrich.ts`
4. Run one tool, usually `claude` or `gemini`
5. Validate CSV + JSON report
6. Test checkpoint resume
7. Run `--tool all`

## 12. Exact Commands Cheat Sheet

```bash
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment
npx vitest run --reporter=verbose
npx tsc --noEmit
npx tsx src/scripts/enrich.ts

export ANTHROPIC_API_KEY="your-key-here"
npx tsx src/scripts/enrich.ts --tool claude

export GOOGLE_GENAI_API_KEY="your-key-here"
npx tsx src/scripts/enrich.ts --tool gemini

export FIRECRAWL_API_KEY="your-key-here"
npx tsx src/scripts/enrich.ts --tool firecrawl

export PERPLEXITY_API_KEY="your-key-here"
npx tsx src/scripts/enrich.ts --tool perplexity

npx tsx src/scripts/enrich.ts --tool all
```

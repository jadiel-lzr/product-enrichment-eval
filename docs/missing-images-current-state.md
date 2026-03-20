# Missing Images Enrichment — Current State

## Current State

We're building a pipeline to find product images for ~500 products that came from feed suppliers (mainly Loschi) with no images. The pipeline uses Claude's `web_search_20250305` API tool to find product page URLs, then (planned) fetches those pages to extract actual image URLs via og:image tags.

**Pass 1 (web search for URLs) is working. Pass 2 (image extraction from pages) is planned but not built.**

## Architecture

```
base-missing-images.csv (500 products)
    ↓
enrich-noimg.ts (orchestration script)
    ↓
noimg-claude-adapter.ts
    ├── Pass 1: Sonnet + web_search API → find product page URL
    │   └── verifyUrl() HEAD request → reject dead links
    └── Pass 2: HTTP fetch page → extract og:image (DISABLED, not built)
    ↓
enriched-noimg-claude.csv (output)
    ↓
frontend/public/data/enriched-noimg-claude.csv (copied for UI display)
```

### Key Files

| File | Purpose |
|------|---------|
| `enrichment/src/adapters/noimg-claude-adapter.ts` | Main adapter — search prompt, URL verification, Pass 2 placeholder |
| `enrichment/src/scripts/enrich-noimg.ts` | CLI script — `--sku` for specific products, `--limit` for batch size |
| `enrichment/src/images/search-config.ts` | Brand→domain mapping, color translations, brand corrections |
| `enrichment/src/types/noimg-enriched.ts` | Zod schema for enrichment output fields |
| `enrichment/.env` | `NOIMG_SEARCH_MODEL`, `CLAUDE_MODEL`, LiteLLM config |
| `frontend/src/components/comparison/EnrichmentCard.tsx` | UI — renders source URLs and images |
| `frontend/src/components/comparison/OriginalDataSection.tsx` | UI — shows feed_name, code, model |

### How to Run

```bash
cd enrichment

# Single product
npx tsx src/scripts/enrich-noimg.ts --sku "26230113.Blue"

# Multiple products
npx tsx src/scripts/enrich-noimg.ts --sku "SKU1,SKU2,SKU3"

# First N products
npx tsx src/scripts/enrich-noimg.ts --limit 20

# All 500
npx tsx src/scripts/enrich-noimg.ts

# Always delete checkpoint before re-running same products
rm -f ../data/checkpoints/checkpoint-noimg-claude.json
```

Output goes to `data/enriched-noimg-claude.csv` and is auto-copied to `frontend/public/data/enriched-noimg-claude.csv`.

### Environment

- `NOIMG_SEARCH_MODEL=anthropic/claude-sonnet-4-6` — model for web search (Sonnet, fast/cheap)
- `CLAUDE_MODEL=anthropic/claude-opus-4-5-20251101` — model for with-images enrichment (not used by noimg adapter currently)
- `LITELLM_BASE_URL` + `LITELLM_API_KEY` — LiteLLM proxy for API calls

## What Was Tested

Ran Pass 1 (URL finding only) on 3 batches of 20 random products each.

### Results Summary

| Batch | Verified URLs | Hit Rate | Time |
|-------|--------------|----------|------|
| Batch 1 | 4/20 | 20% | ~4 min |
| Batch 2 | 7/20 | 35% | ~4 min |
| Batch 3 | 8/20 | 40% | ~4 min |

### What Works Well

- **High-confidence matches are very accurate** — official brand sites (Alexander McQueen, CB Made in Italy, Balmain, La DoubleJ) and major retailers return correct product pages
- **URL verification catches dead links** — HEAD request rejects 404s before saving
- **Match reasons are logged** — each result explains why it matched (e.g. "Code 199942 confirmed via italist; name + color match")
- **CB Made in Italy** has near-100% hit rate on their own site (cbmadeinitaly.com)
- **Mini Rodini** found consistently on Shopify retailers (smoochiebaby.com, luksusbaby.kr, stadtlandkind.ch)

### What Doesn't Work

- **D&G Junior** — internal SKUs (L44Q01FU63D, L5JTOXG7P0J etc.) are not indexed by any retailer. 0% hit rate across all batches.
- **Niche Italian brands** — Brando-Lubiam, Babe & Tess, Antonino Valenti have no online product pages
- **SS26 products** — Off-White, Mini Rodini SS26 items not yet indexed by retailers
- **Loschi's own site** — products appear in Google search index for loschiboutique.com but pages return 404 when fetched

### Key Learnings from Testing

1. **Color matching matters** — wrong color variant on same product = wrong images. Prompt now says: wrong color = "none" confidence
2. **Out-of-stock pages with no images are useless** — prompt requires page to have product images
3. **Product codes appear in different formats** — `OBIA008C99LEA002.0110` in our feed = `OBIA008C99LEA002 0110` on giglio.com. The model handles this well.
4. **Near-color matches** (dark brown vs brown) get "medium" confidence, not "high"
5. **Don't use `allowed_domains` with Anthropic's web_search tool** — some domains block the crawler (courreges.com, jilsander.com) and cause hard 400 errors for the entire request. Use unrestricted search with site: hints instead.
6. **Don't combine `response_format` (JSON schema) with `web_search` tool** — triggers "Schema is too complex" error. Ask for JSON in the prompt text instead.

### A/B Test: Site Hints vs No Site Hints

Tested whether the `site:brand.com` hints in the search prompt actually improve results. Two rounds:

#### Round 1 — 13 products (initial pilot)

| Result | Count |
|--------|-------|
| Identical match (same URL, same confidence) | 7/13 |
| Found but different source or lower confidence | 4/13 |
| Lost (not found without hints) | 2/13 |

The 2 lost products were Mini Rodini (found via niche retailer stadtlandkind.ch with hints) and Khaite (FWRD link was flaky). Major brands (McQueen, Balmain, Burberry, Courrèges) were found identically without hints.

#### Round 2 — 111 products (full coverage, 2026-03-19)

Re-ran all 111 products that had a `source_url` from the enriched CSV. Same search prompt, site hints stripped.

| Result | Count | % |
|--------|-------|---|
| Identical (same URL + confidence) | 57 | 51% |
| Lost (found with hints, not without) | 24 | 22% |
| Different source (valid alternative URL) | 23 | 21% |
| Same URL, different confidence | 7 | 6% |

**Most affected brands without hints:**

| Brand | Lost | Notes |
|-------|------|-------|
| Burberry | 8 | Hints direct to `us.burberry.com` with unique product IDs (e.g. `p81139371`) |
| CB Made in Italy | 4 | Niche brand, hints pointed to `cbmadeinitaly.com` |
| Save the Duck | 3 | Found right URL but different regional domain returned non-200 |
| Alexander McQueen | 2 | Official site URLs not discovered without hints |
| Balmain | 1 | `int.balmain.com` not found, but `us.balmain.com` was |
| Zanone / Glanshirt | 2 | Slowear sub-brands, hints pointed to `slowear.com` |
| Mini Rodini | 1 | Niche kids retailer (stadtlandkind.ch) not found |
| Montblanc | 1 | Eyewear retailer link flaky |
| Boss Hugo Boss | 1 | Niche eyewear retailer not found |
| Bon Ton Toys | 1 | Regional domain (us.bontontoys.com) not found |
| Blancha | 1 | Mytheresa link returned non-200 in both cases |

**"Different source" is mostly fine:** 23 products found the same product on a different retailer. Common swaps: `us.balmain.com` ↔ `ca.balmain.com`, `cbmadeinitaly.com` ↔ `italist.com`, `alexandermcqueen.com` ↔ third-party boutiques.

**Confidence shifts both ways:** 4 dropped from high→medium without hints, 3 went medium→high (Mini Rodini and Bon Ton Toys found better matches on general retailers).

**New retailers discovered** (added to `RETAILER_DOMAINS` in search-config.ts): gebnegozionline.com, junioredition.com, fourkids.com, lyst.com, fashionclinic.com, stadtlandkind.ch, mochikids.com, cettire.com, flannels.com, antonioli.eu, endclothing.com, montiboutique.com, gaudenziboutique.com.

**Conclusion:** At scale, site hints improve match rate by ~22% and are critical for:
1. Brands with complex URL structures (Burberry, Balmain) where product IDs aren't easily searchable
2. Niche/small brands that don't rank high in general search (CB Made in Italy, Blancha)
3. Products where the official site has unique product codes in URLs

The current ~50 brand map should be maintained and expanded. For brands not in the map, unrestricted search still works — but the 22% loss rate justifies the effort of maintaining domain mappings.

## What Needs to Be Done

### Immediate: Enable Pass 2 (Image Extraction)

The `extractImageFromPage()` function exists in `noimg-claude-adapter.ts` but is commented out. It:
1. Fetches the verified URL with a standard HTTP GET
2. Parses og:image meta tag from HTML
3. Falls back to JSON-LD structured data `image` field
4. Returns the image URL or undefined

To enable: uncomment the Pass 2 block (search for "DISABLED FOR TESTING") and run on products that got verified URLs.

### Later: Metadata Enrichment

Currently Pass 1 only returns `source_url`, `confidence_score`, and `match_reason`. Metadata fields (title, description_eng, materials, etc.) are not populated. This is intentional — focus is on getting correct images first before spending on metadata extraction. Metadata enrichment can be added later as a separate pass once image coverage is validated.

### Scale: Run All 500 Products

Current cost estimate: ~$0.01-0.02 per product for Pass 1 (Sonnet web search). Full 500 products ≈ $5-10. Pass 2 is just HTTP fetches (no API cost).

### Explore: Loschi Site Scraping

Products from `feed_name=loschi` were found in Google's index for loschiboutique.com but pages returned 404. The URL pattern is `https://loschiboutique.com/en/product/{slug}-{sku}/`. Worth investigating:
- Are pages behind auth?
- Were they recently removed?
- Can we access the Loschi site directly with different user agent / cookies?

If Loschi's site works, it would be the highest-ROI source — these images likely already exist there.

### Reference: Italist Pipeline Spike

We received a detailed doc from the Italist team about their enrichment pipeline (`docs/` or ask Estella). Key takeaways relevant to this work:
- **Exact MPN match only for images** — core/fuzzy matches cause wrong-color images
- **Cheapest sources first** — exhaust free sources (sibling matching, existing feeds) before paid APIs
- **GPT-4o-mini vision** at $0.002/product for 18 attributes — could be useful for metadata enrichment once we have images
- **Google Lens via Bright Data** — 70% model name hit rate at $1.50/1K, much cheaper than web search API
- **Never override feed data with AI-generated data** — feed materials/colors are source of truth

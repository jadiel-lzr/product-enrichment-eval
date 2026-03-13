# Product Enrichment Evaluation

## Purpose

Validation project to compare enrichment tools on ~500 products from vendor feeds.
Present results to client so they can choose the best enrichment strategy.

## Problem

Product feeds from vendors often have poor/missing data. Current enrichment with FireCrawl
is insufficient for a large percentage of products. Need to evaluate alternatives.

## Fields to Enrich

- `description_eng` — Product description in English
- `season` / `year` / `collection` — Seasonal metadata
- `gtin` — Global Trade Item Number (barcode)
- `dimensions` — Product dimensions

## Enrichment Tools (Core 4 + Stretch)


| Tool               | Type         | Strategy                                            |
| ------------------ | ------------ | --------------------------------------------------- |
| Claude (Anthropic) | LLM + Vision | Send product data + images, generate missing fields |
| Gemini (Google)    | LLM + Vision | Same approach, different model                      |
| FireCrawl          | Web Scraping | Scrape brand sites + Google Shopping                |
| Perplexity         | Search + LLM | Web search for product info + generate              |
| Apify (stretch)    | Web Scraping | Pre-built e-commerce scrapers                       |
| Zyte (stretch)     | AI Scraping  | AI-powered extraction, no selectors needed           |
| Describely (stretch) | AI SaaS    | Purpose-built product enrichment, generates descriptions |


## Data Flow

1. Read base CSV (`originalUnEnrichedProductFeed.csv`) — 500 products
2. For each tool, run enrichment pipeline → output enriched CSV
3. React UI loads all CSVs, displays side-by-side comparison

## Tech Stack

- **Enrichment scripts**: TypeScript
- **Frontend**: React + Vite (filtering, scoring, side-by-side cards)

## Output Files

- `data/base.csv` — Original unenriched data (copy of source)
- `data/enriched-claude.csv` — Enriched by Claude
- `data/enriched-gemini.csv` — Enriched by Gemini
- `data/enriched-firecrawl.csv` — Enriched by FireCrawl
- `data/enriched-perplexity.csv` — Enriched by Perplexity
- `data/enriched-apify.csv` — Enriched by Apify (stretch)
- `data/enriched-zyte.csv` — Enriched by Zyte (stretch)
- `data/enriched-describely.csv` — Enriched by Describely (stretch)


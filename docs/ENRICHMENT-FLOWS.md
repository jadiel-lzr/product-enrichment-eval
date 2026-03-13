# Enrichment Flows — Step by Step

How each tool processes a single product, from input to output.

---

## Shared Input (All Tools)

Every tool receives a `Product` object parsed from `data/base.csv`:

```
Product {
  sku, brand, name, model, color, category, department,
  images[], gtin[], season, year, collection, made_in,
  materials_original, dimensions, description, ...
  lens_all_matches (JSON string),    ← Google Lens visual matches
  lens_brand_matches (JSON string),  ← filtered to brand retailers
}
```

**Cached images** are loaded from `data/images/` via `data/image-manifest.json`, resized to max 1024px, JPEG quality 85.

---

## Target Fields (11 fields)

Every tool attempts to fill the same 11 fields, split by confidence strategy:

**Factual fields** (leave blank if uncertain — wrong data is worse than missing):

| Field | Description | Example |
|-------|-------------|---------|
| `gtin` | Global Trade Item Number (barcode) | `"8057963952335"` |
| `dimensions` | Physical dimensions | `"30 x 20 x 10 cm"` |
| `year` | Product year | `"2023"` |
| `weight` | Product weight | `"0.8 kg"` |

**Generative fields** (always attempt to fill, even with moderate confidence):

| Field | Description | Example |
|-------|-------------|---------|
| `description_eng` | Luxury e-commerce copy, 2-3 sentences | `"Crafted from calfskin leather..."` |
| `season` | Season name | `"Fall Winter 2023"` |
| `collection` | Collection name | `"GG Marmont"` |
| `materials` | Material composition | `"Calfskin leather, gold-tone hardware"` |
| `made_in` | Country of manufacture | `"Italy"` |
| `color` | Normalized color name | `"Black"` |
| `additional_info` | Supplementary details (care, features) | `"Features quilted chevron pattern..."` |

Each enrichment also returns an `accuracy_score` (integer 1-10) representing overall confidence.

Fill rate = count of non-empty filled fields / 11.

---

## Shared Output (All Tools)

Every tool returns an `EnrichmentResult`:

```
EnrichmentResult {
  fields: { description_eng, season, year, collection, gtin,
            dimensions, made_in, materials, weight, color,
            additional_info },
  status: 'success' | 'partial' | 'failed',
  fillRate: 0-1,
  enrichedFields: string[],
  accuracyScore?: 1-10,
  error?: string
}
```

Written to `data/enriched-{tool}.csv` with original product fields + enriched fields + metadata columns.

---

## Claude (Vision LLM)

```
Product + Images
    │
    ▼
┌─────────────────────────────┐
│ 1. Load cached product      │
│    images (base64)          │
│                             │
│ 2. Build enrichment prompt: │
│    • Product identity       │
│    • Existing field values  │
│    • Lens match context     │  ← up to 5 brand match titles/sources
│    • 11 target fields       │
│    • Confidence strategy    │
│                             │
│ 3. Send to Claude API:      │
│    • Images as base64       │
│    • Text prompt            │
│    • JSON schema format     │
│                             │
│ 4. Parse JSON response      │
│ 5. Validate with Zod        │
│ 6. Compute fill rate        │
└─────────────────────────────┘
    │
    ▼
EnrichmentResult (with accuracy_score)
```

**Key details:**
- Native SDK: `@anthropic-ai/sdk` (or OpenAI SDK via LiteLLM)
- Default model: `claude-haiku-4-5-20250415`
- Images placed before text in message (vision-first)
- Structured output via `json_schema` output config
- Concurrency: 3

---

## Gemini (Vision LLM)

```
Product + Images
    │
    ▼
┌─────────────────────────────┐
│ 1. Load cached product      │
│    images (base64)          │
│                             │
│ 2. Build enrichment prompt: │
│    • Product identity       │
│    • Existing field values  │
│    • Lens match context     │  ← same as Claude
│    • 11 target fields       │
│    • Confidence strategy    │
│                             │
│ 3. Send to Gemini API:      │
│    • Images as inline data  │
│    • Text prompt            │
│    • JSON schema response   │
│                             │
│ 4. Parse JSON response      │
│ 5. Validate with Zod        │
│ 6. Compute fill rate        │
└─────────────────────────────┘
    │
    ▼
EnrichmentResult (with accuracy_score)
```

**Key details:**
- Native SDK: `@google/genai` (or OpenAI SDK via LiteLLM)
- Default model: `gemini-2.5-flash`
- Images as `inlineData` parts
- Structured output via `responseMimeType: 'application/json'` + `responseJsonSchema`
- Concurrency: 5

---

## Perplexity (Search-Augmented LLM)

```
Product (no images)
    │
    ▼
┌─────────────────────────────┐
│ 1. Build enrichment prompt: │
│    • Product identity       │
│    • Existing field values  │
│    • Lens match context     │  ← same prompt as vision LLMs
│    • 11 target fields       │
│    • Confidence strategy    │
│                             │
│ 2. Send to Perplexity API:  │
│    • Text prompt only       │
│    • JSON schema format     │
│    (Perplexity searches     │
│     the web internally)     │
│                             │
│ 3. Parse JSON response      │
│    (with regex fallback     │
│     for free-text)          │
│ 4. Validate with Zod        │
│ 5. Compute fill rate        │
└─────────────────────────────┘
    │
    ▼
EnrichmentResult (with accuracy_score)
```

**Key details:**
- SDK: `openai` (OpenAI-compatible API, or via LiteLLM)
- Default model: `sonar-pro`
- No image support — relies on product metadata + web search
- Perplexity internally searches the web before generating
- Has regex-based JSON extraction fallback for free-text responses
- Concurrency: 3

---

## FireCrawl (Web Scraping)

```
Product (no images)
    │
    ▼
┌───────────────────────────────────────┐
│ 1. Identify missing target fields     │
│    (skip fields already filled)       │
│    If all filled → return early       │
│                                       │
│ 2. Find a URL to scrape (priority):   │
│                                       │
│    a. Google Lens brand match URLs    │  ← highest priority
│       • Parse lens_brand_matches      │
│       • Filter stock photo domains    │
│       • Use first valid retailer URL  │
│                                       │
│    b. FireCrawl search                │
│       • Query: "brand name model"    │
│       • Pick best URL (prefer brand  │
│         domain, avoid Google Shopping)│
│                                       │
│    c. Google Shopping fallback         │
│       • Query: "brand name            │
│         site:shopping.google.com"     │
│                                       │
│    If no URL found → return failed    │
│                                       │
│ 3. Scrape the URL:                    │
│    • Send scrape prompt with only     │
│      missing field names              │
│    • JSON schema targeting those      │
│      specific fields                  │
│    • FireCrawl extracts structured    │
│      data from the page               │
│                                       │
│ 4. Clean scraped fields               │
│    • Only keep requested fields       │
│    • Trim strings, validate with Zod  │
│ 5. Merge with existing product data   │
│ 6. Compute fill rate                  │
└───────────────────────────────────────┘
    │
    ▼
EnrichmentResult (no accuracy_score)
```

**Key details:**
- SDK: `@mendable/firecrawl-js`
- Does NOT use the shared enrichment prompt — has its own scrape-specific prompt
- Only requests missing fields (if product already has season, color, etc. those are skipped)
- URL discovery is multi-layered: lens → serpapi → search → shopping fallback
- Stock photo domains (iStock, Getty, Shutterstock, etc.) are filtered from lens results
- Concurrency: 2

---

## Batch Runner (Shared)

All tools go through the same batch runner:

```
Products[] + Adapter
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Load checkpoint (if exists)      │
│    • Skip success/partial SKUs      │
│    • Retry failed SKUs              │
│                                     │
│ 2. Process remaining products:      │
│    • Concurrency limit per tool     │
│    • Load images for each product   │
│    • Call adapter.enrich(product)    │
│    • Write checkpoint after each    │
│                                     │
│ 3. Merge results:                   │
│    • Original product fields        │
│    • Enriched fields                │
│    • Metadata columns               │
│                                     │
│ 4. Write outputs:                   │
│    • data/enriched-{tool}.csv       │
│    • data/reports/run-report.json   │
│    • data/checkpoints/checkpoint    │
└─────────────────────────────────────┘
```

**Checkpoint behavior:**
- `success` and `partial` products are skipped on re-run
- `failed` products are automatically retried
- Delete checkpoint file to force full re-run

---

## Google Lens Data Flow

Pre-computed by a separate SerpAPI script (not part of the enrichment pipeline):

```
Product images
    │
    ▼
SerpAPI Google Lens
    │
    ▼
┌──────────────────────────────┐
│ lens_all_matches:            │
│   All visual matches         │
│   (includes stock photos)    │
│   231/500 products           │
│                              │
│ lens_brand_matches:          │
│   Filtered to brand matches  │
│   (real retailer pages)      │
│   224/500 products           │
└──────────────────────────────┘
    │
    ▼
Stored in base.csv as JSON strings
    │
    ├──► LLM prompt context (titles + sources)
    └──► FireCrawl scraping URLs (links)
```

**Filtering:** Stock photo domains are removed: istockphoto.com, gettyimages.com, shutterstock.com, alamy.com, depositphotos.com, dreamstime.com, 123rf.com.

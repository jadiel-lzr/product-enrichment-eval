# Phase 1: Data Foundation - Research

**Researched:** 2026-03-13
**Domain:** CSV parsing, data cleaning, image pre-flight, TypeScript types/schemas
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield data ingestion layer for a 500-product CSV (37 columns, 3 embedded JSON columns, ~1000 image URLs across 2 domains). The source data is well-structured with PapaParse-compatible quoting for embedded JSON. Two test products ("Prodotto Test" / "Brand di prova") need filtering, all 192 unique color values need lowercase normalization, and 498/500 products have empty `description_eng` and `dimensions` fields per the `errors` column manifest.

The project runs on Node.js 25.2.1 which has stable native TypeScript type-stripping -- `.ts` files execute directly with `node` without any transpiler. The standard stack is PapaParse for CSV, Zod v3 for schemas, native `fetch` for HTTP, and `p-limit` for concurrency. All image URLs come from 3 domains (989 from atelier-hub.com, 6 from adda.coralmatch.com, 3 from sandbox-guidi.coralmatch.com), all JPEG/WebP.

**Primary recommendation:** Use Node.js native TypeScript execution (no tsx/ts-node), PapaParse 5.5 with `header: true`, Zod 3.x for schemas, native `fetch` + `node:stream/promises` pipeline for image downloads, and `p-limit` for download concurrency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pattern matching to identify and remove test/placeholder products (e.g., names containing "Prodotto Test", brands matching "Brand di prova")
- Colors normalized to lowercase + trim; `color_original` column preserves raw vendor value
- Title sanitization: trim whitespace
- Products with zero reachable images kept but flagged via `_has_images` column
- Cleaning produces console summary and `data/cleaning-report.json` listing every product filtered and why
- Curated subset of columns sent to enrichment tools (identifiers, product info, pricing) -- skip raw/original duplicates and internal metadata
- All embedded JSON columns parsed into typed arrays: `images` -> `string[]`, `errors` -> `ErrorEntry[]`, `sizes` -> `SizeEntry[]`
- Preserve all `_original` columns in Product type as read-only reference
- Hybrid enrichment approach: use `errors` column as starting manifest plus allow tools to fill additional fields
- Cache ALL reachable images per product (not just first) -- products have 1-3 images each
- Store as raw files: `data/images/{sku}_{index}.{ext}` (JPEG/PNG/WebP)
- Convert to base64 on-demand in Phase 2
- Broken/unreachable URLs: retry once after short delay, then log and skip
- Image manifest: `data/image-manifest.json` tracks per URL: status, content-type, file size, local path
- `data/base.csv` contains only cleaned/valid products (test products removed)
- Embedded JSON columns kept as JSON strings in CSV -- TypeScript types handle parsing at load time
- Add 3 computed metadata columns: `_missing_fields` (count), `_has_images` (boolean), `_image_count` (number of cached images)
- Single base.csv with `_has_images` flag rather than separate files

### Claude's Discretion
- Exact Zod schema strictness levels (strict vs passthrough for unknown fields)
- CSV parsing configuration details (delimiter handling, quote escaping)
- Image download concurrency and timeout values
- TypeScript project scaffolding structure (tsconfig, package.json setup)
- Error handling specifics during CSV parsing and image downloading

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PIPE-01 | System parses source CSV into typed product objects with validated fields | PapaParse 5.5 with `header: true` parses CSV; Zod schemas validate each row; embedded JSON columns (`images`, `errors`, `sizes`) parsed via `JSON.parse` into typed arrays; 37 columns mapped to TypeScript `Product` type |
| PIPE-06 | System cleans product data before enrichment (sanitize titles, normalize colors, filter test/placeholder products, parse embedded JSON fields, trim whitespace) | 2 test products identified by pattern ("Prodotto Test" / "Brand di prova"); 192 colors all-uppercase needing `toLowerCase().trim()`; `errors` column parsed as enrichment manifest (498 products missing `description_eng`); cleaning report as JSON audit trail |
| PIPE-02 | System pre-validates image URLs and caches reachable images for LLM consumption | 998 total image URLs across 3 domains; native `fetch` HEAD requests for pre-flight; `node:stream/promises` pipeline for download; `p-limit` for concurrency (10-15 concurrent); images stored as `data/images/{sku}_{index}.{ext}` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 25.2.1 | Runtime with native TypeScript | Stable type-stripping, no transpiler needed, native fetch |
| PapaParse | 5.5.3 | CSV parsing and writing | De-facto standard for JS CSV, handles embedded JSON quoting correctly, TypeScript types via `@types/papaparse` |
| Zod | 3.24.x | Schema validation + type inference | Mature, widely used, `z.infer<>` generates types from schemas, good coercion support for CSV string data |
| p-limit | 7.3.0 | Async concurrency control | Lightweight, ESM-native, used for image download throttling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/papaparse | 5.3.16 | TypeScript types for PapaParse | Always -- PapaParse does not ship its own types |
| TypeScript | 5.x | Type checking (tsc --noEmit) | For IDE support and CI type checking only -- not for compilation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PapaParse | csv42 | csv42 supports nested JSON natively but smaller ecosystem; PapaParse handles the embedded JSON fine via standard CSV quoting |
| Zod 3.24 | Zod 4.x | Zod 4 is newer/smaller but has breaking API changes (string validators moved to top-level); v3 is stable with massive ecosystem support |
| p-limit | manual Promise.allSettled batching | p-limit handles queue management, abort, and edge cases that manual batching misses |
| tsx | Node.js native TS | Node 25.2.1 has stable type-stripping; tsx adds unnecessary dependency |

**Installation:**
```bash
npm install papaparse zod p-limit
npm install -D @types/papaparse typescript @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
enrichment/
├── src/
│   ├── types/
│   │   ├── product.ts          # Product Zod schema + inferred type
│   │   ├── enriched.ts         # EnrichedFields schema + type
│   │   └── index.ts            # Re-export all types
│   ├── parsers/
│   │   ├── csv-reader.ts       # PapaParse wrapper: CSV -> raw rows
│   │   ├── csv-writer.ts       # PapaParse unparse: typed objects -> CSV
│   │   └── json-columns.ts     # Parse embedded JSON columns (images, errors, sizes)
│   ├── cleaning/
│   │   ├── cleaner.ts          # Orchestrate all cleaning steps
│   │   ├── filters.ts          # Test product detection, filtering rules
│   │   ├── normalizers.ts      # Color normalization, title sanitization, whitespace
│   │   └── report.ts           # Generate cleaning-report.json
│   ├── images/
│   │   ├── preflight.ts        # HEAD request validation
│   │   ├── downloader.ts       # Download images to disk with concurrency
│   │   └── manifest.ts         # Read/write image-manifest.json
│   └── scripts/
│       ├── parse-and-clean.ts  # CLI: parse CSV -> clean -> write base.csv
│       └── cache-images.ts     # CLI: pre-flight + download images
├── package.json
├── tsconfig.json
└── .env.example
```

### Pattern 1: Zod Schema as Single Source of Truth
**What:** Define Zod schemas first, derive TypeScript types with `z.infer<>`. All validation happens through schemas.
**When to use:** Always -- schemas are the contract between CSV parsing boundary and downstream consumers.
**Example:**
```typescript
// Source: Zod official docs (zod.dev)
import { z } from 'zod'

const SizeEntrySchema = z.object({
  Qty: z.number(),
  sku: z.string(),
  Size: z.string(),
  Barcode: z.string(),
  Currency: z.string(),
  NetPrice: z.number(),
  BrandReferencePrice: z.number(),
})

const ErrorEntrySchema = z.object({
  error: z.string(),
  field: z.string(),
})

const ProductSchema = z.object({
  sku: z.string(),
  code: z.string(),
  gtin: z.array(z.string()),           // Parsed from JSON string "[]" or '["2000026685067"]'
  name: z.string(),
  brand: z.string(),
  color: z.string(),
  model: z.string(),
  price: z.coerce.number(),            // CSV strings coerced to number
  sizes: z.array(SizeEntrySchema),     // Parsed from JSON string
  errors: z.array(ErrorEntrySchema),   // Parsed from JSON string
  images: z.array(z.string()),         // Parsed from JSON string
  season: z.string(),
  made_in: z.string(),
  category: z.string(),
  feed_name: z.string(),
  department: z.string(),
  product_id: z.string(),
  season_year: z.string(),
  color_original: z.string(),
  made_in_original: z.string(),
  category_original: z.string(),
  materials_original: z.string(),
  department_original: z.string(),
  unit_system_name_original: z.string(),
  year: z.string(),                    // Keep as string -- some are empty, some "2023"
  collection: z.string(),
  dimensions: z.string(),
  collection_original: z.string(),
  title: z.string(),
  sizes_raw: z.string(),
  season_raw: z.string(),
  description: z.string(),
  size_system: z.string(),
  category_item: z.string(),
  season_display: z.string(),
  sizes_original: z.string(),
  vendor_product_id: z.string(),
  // Computed metadata (added during cleaning)
  _missing_fields: z.number().optional(),
  _has_images: z.boolean().optional(),
  _image_count: z.number().optional(),
})

type Product = z.infer<typeof ProductSchema>
```

### Pattern 2: Two-Phase Parse (Raw CSV -> Typed Objects)
**What:** First parse CSV to raw string rows with PapaParse, then transform embedded JSON columns and validate through Zod.
**When to use:** Always for this CSV -- embedded JSON columns cannot be handled by PapaParse's `dynamicTyping` alone.
**Example:**
```typescript
import Papa from 'papaparse'
import { readFileSync } from 'node:fs'

// Phase 1: Raw parse
const csvText = readFileSync('originalUnEnrichedProductFeed.csv', 'utf-8')
const { data: rawRows, errors } = Papa.parse<Record<string, string>>(csvText, {
  header: true,
  skipEmptyLines: true,
  // Do NOT use dynamicTyping -- we handle type conversion in Zod
})

// Phase 2: Transform JSON columns + validate
const products = rawRows.map((row, index) => {
  const transformed = {
    ...row,
    gtin: JSON.parse(row.gtin || '[]'),
    sizes: JSON.parse(row.sizes || '[]'),
    errors: JSON.parse(row.errors || '[]'),
    images: JSON.parse(row.images || '[]'),
  }
  return ProductSchema.parse(transformed)
})
```

### Pattern 3: Immutable Cleaning Pipeline
**What:** Each cleaning step returns a new array/object (never mutates). Steps compose as pure functions.
**When to use:** All cleaning operations -- aligns with project coding conventions.
**Example:**
```typescript
// Each step is a pure function: Product[] -> Product[]
const filterTestProducts = (products: Product[]): Product[] =>
  products.filter(p =>
    !p.name.includes('Prodotto Test') &&
    p.brand !== 'Brand di prova'
  )

const normalizeColors = (products: Product[]): Product[] =>
  products.map(p => ({
    ...p,
    color: p.color.toLowerCase().trim(),
  }))

// Compose steps
const cleaned = normalizeColors(filterTestProducts(parsed))
```

### Pattern 4: Image Download with Streaming
**What:** Use native `fetch` + `node:stream/promises` pipeline to stream images directly to disk without buffering entire files in memory.
**When to use:** Image download phase.
**Example:**
```typescript
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  if (!response.body) throw new Error(`No response body for ${url}`)

  const nodeStream = Readable.fromWeb(response.body)
  await pipeline(nodeStream, createWriteStream(destPath))
}
```

### Anti-Patterns to Avoid
- **Mutating product objects during cleaning:** Always spread into new objects. The coding rules require immutability.
- **Using `dynamicTyping: true` in PapaParse:** This would attempt to parse embedded JSON columns as numbers/booleans, corrupting them. Parse as strings, then transform JSON columns explicitly.
- **Buffering all images in memory:** With ~1000 images, use streaming writes to disk.
- **Sequential image downloads:** At 1000 URLs, sequential downloads would take 15+ minutes. Use `p-limit` with concurrency 10-15.
- **Coupling cleaning logic with parsing:** Keep CSV parsing and business cleaning as separate modules for testability.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing with embedded JSON | Custom delimiter/quote parser | PapaParse with `header: true` | CSV quote escaping has dozens of edge cases; PapaParse handles RFC 4180 compliance |
| Schema validation + types | Manual type assertions / runtime checks | Zod schemas with `z.infer<>` | Keeps types and validation in sync; handles coercion (string-to-number); provides actionable error messages |
| Concurrency limiting | Manual Promise batching | p-limit | Queue management, cleanup on abort, edge cases with error propagation |
| File download streaming | `fs.writeFileSync(await (await fetch(url)).buffer())` | `pipeline(Readable.fromWeb(body), createWriteStream(path))` | Memory-safe for large files; proper error propagation and cleanup |

**Key insight:** The CSV has embedded JSON with escaped quotes inside quoted CSV fields. PapaParse handles this correctly out of the box. Hand-rolling a parser here would be extremely error-prone.

## Common Pitfalls

### Pitfall 1: PapaParse dynamicTyping Corrupting JSON Columns
**What goes wrong:** With `dynamicTyping: true`, PapaParse attempts to parse `"[]"` as an empty array (actually fine), but for complex JSON strings, it can produce unexpected results or partially parse values.
**Why it happens:** `dynamicTyping` is designed for simple values (numbers, booleans), not embedded JSON objects.
**How to avoid:** Set `dynamicTyping: false` (or omit it). Parse all fields as strings, then explicitly `JSON.parse()` the 3 JSON columns (`images`, `errors`, `sizes`).
**Warning signs:** Type errors when accessing `.length` on what should be an array.

### Pitfall 2: GTIN Column is JSON Array, Not Scalar
**What goes wrong:** Treating `gtin` as a simple string when it's actually a JSON array like `["2000026685067"]` or `[]`.
**Why it happens:** Most columns are scalars, easy to forget `gtin` is JSON.
**How to avoid:** Parse `gtin` with `JSON.parse()` alongside the other 3 JSON columns. Schema defines it as `z.array(z.string())`.
**Warning signs:** GTIN showing up as `["2000026685067"]` string in output CSV instead of the extracted value.

### Pitfall 3: Empty String vs Missing Field in CSV
**What goes wrong:** Treating empty CSV cells (`,,`) the same as truly missing fields. PapaParse returns `""` for empty cells, not `undefined`.
**Why it happens:** CSV has no concept of null/undefined. Empty cells and fields with empty strings are indistinguishable.
**How to avoid:** In the Zod schema, use `.default('')` or allow empty strings for optional text fields. For computed `_missing_fields`, check against both empty string and the `errors` column manifest.
**Warning signs:** Zod validation errors on empty strings when schema expects non-empty.

### Pitfall 4: Image Extension Extraction from URL
**What goes wrong:** Extracting extension from URL incorrectly when URL has query params or no extension.
**Why it happens:** URLs like `https://example.com/image.jpeg?w=1200` need the extension extracted before query params.
**How to avoid:** Parse with `new URL(url)`, get pathname, then extract extension from path.
**Warning signs:** Files saved as `.jpeg?w=1200` or missing extensions.

### Pitfall 5: HEAD Request Not Supported by All Servers
**What goes wrong:** Some servers return 405 Method Not Allowed for HEAD requests, or return different content-type headers than actual GET responses.
**Why it happens:** HEAD support is optional in HTTP servers.
**How to avoid:** If HEAD fails with 405, fall back to a GET request with an `AbortController` that cancels after reading response headers.
**Warning signs:** Many images showing as "unreachable" when they're actually fine with GET.

### Pitfall 6: p-limit ESM Import in TypeScript
**What goes wrong:** Import errors when using p-limit in a TypeScript project not configured for ESM.
**Why it happens:** p-limit v6+ is ESM-only. TypeScript projects using `"module": "commonjs"` cannot import it.
**How to avoid:** Use `"type": "module"` in package.json and `"module": "nodenext"` / `"moduleResolution": "nodenext"` in tsconfig.json. Node 25 handles this natively.
**Warning signs:** `ERR_REQUIRE_ESM` or `Cannot find module` errors.

### Pitfall 7: CSV Write Preserving JSON Columns
**What goes wrong:** When writing `base.csv`, if you pass parsed arrays/objects to PapaParse unparse, they get serialized as `[object Object]` instead of JSON strings.
**Why it happens:** PapaParse's `unparse()` calls `.toString()` on values, not `JSON.stringify()`.
**How to avoid:** Before writing CSV, transform parsed JSON fields back to `JSON.stringify()` strings. Keep the "JSON as string in CSV, parsed at load time" convention.
**Warning signs:** `[object Object]` in output CSV cells.

## Code Examples

### CSV Reader with JSON Column Parsing
```typescript
// Source: PapaParse docs (papaparse.com/docs)
import Papa from 'papaparse'
import { readFileSync } from 'node:fs'
import { ProductSchema, type Product } from './types/product.js'

interface ParseResult {
  products: Product[]
  errors: Papa.ParseError[]
  rowCount: number
}

function parseProductCSV(filePath: string): ParseResult {
  const csvText = readFileSync(filePath, 'utf-8')
  const { data: rawRows, errors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const products = rawRows.map((row) => {
    const withParsedJson = {
      ...row,
      gtin: JSON.parse(row.gtin || '[]'),
      sizes: JSON.parse(row.sizes || '[]'),
      errors: JSON.parse(row.errors || '[]'),
      images: JSON.parse(row.images || '[]'),
    }
    return ProductSchema.parse(withParsedJson)
  })

  return { products, errors, rowCount: rawRows.length }
}
```

### Image Pre-flight with Retry
```typescript
import pLimit from 'p-limit'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { join, extname } from 'node:path'

interface ImageStatus {
  url: string
  status: 'reachable' | 'unreachable'
  contentType?: string
  fileSize?: number
  localPath?: string
  error?: string
}

async function checkImageUrl(url: string): Promise<ImageStatus> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) {
      // Retry with GET if HEAD fails (405 Method Not Allowed)
      if (response.status === 405) {
        const controller = new AbortController()
        const getResponse = await fetch(url, { signal: controller.signal })
        const contentType = getResponse.headers.get('content-type') ?? undefined
        const fileSize = Number(getResponse.headers.get('content-length')) || undefined
        controller.abort()
        return { url, status: 'reachable', contentType, fileSize }
      }
      return { url, status: 'unreachable', error: `HTTP ${response.status}` }
    }
    return {
      url,
      status: 'reachable',
      contentType: response.headers.get('content-type') ?? undefined,
      fileSize: Number(response.headers.get('content-length')) || undefined,
    }
  } catch (error) {
    return {
      url,
      status: 'unreachable',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!response.body) throw new Error('No response body')

  const nodeStream = Readable.fromWeb(response.body as ReadableStream)
  await pipeline(nodeStream, createWriteStream(destPath))
}
```

### Cleaning Pipeline
```typescript
import type { Product } from './types/product.js'

interface CleaningReport {
  totalInput: number
  totalOutput: number
  removed: Array<{ sku: string; reason: string }>
  normalizationsApplied: { colors: number; titles: number }
}

function isTestProduct(product: Product): boolean {
  return product.name.includes('Prodotto Test')
    || product.brand === 'Brand di prova'
}

function filterTestProducts(
  products: readonly Product[]
): { kept: Product[]; removed: Array<{ sku: string; reason: string }> } {
  const kept: Product[] = []
  const removed: Array<{ sku: string; reason: string }> = []

  for (const p of products) {
    if (isTestProduct(p)) {
      removed.push({ sku: p.sku, reason: 'test/placeholder product' })
    } else {
      kept.push(p)
    }
  }

  return { kept, removed }
}

function normalizeColor(product: Product): Product {
  return { ...product, color: product.color.toLowerCase().trim() }
}

function sanitizeTitle(product: Product): Product {
  return { ...product, title: product.title.trim(), name: product.name.trim() }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsx / ts-node for running TS | Node.js native type-stripping | Node 25.2.0 (Nov 2025) | Zero-dependency TS execution; no build step needed |
| Zod v3 method chaining | Zod v4 top-level functions | Zod 4.0 (2025) | Smaller bundle; but v3 is still stable and widely supported -- use v3 for this project |
| node-fetch / axios for HTTP | Native `fetch` in Node.js | Node 18+ (stable in 21+) | No HTTP client dependency needed |
| require() with CommonJS | ESM with `"type": "module"` | Ecosystem-wide 2023-2025 | p-limit and other sindresorhus packages are ESM-only |

**Deprecated/outdated:**
- **ts-node**: Slower than tsx, and both are unnecessary on Node 25
- **node-fetch**: Native `fetch` is stable and built-in
- **Zod `.preprocess()`**: Prefer `z.coerce.*` for simple type conversions (cleaner API)

## Data Insights (from CSV Analysis)

These findings inform implementation decisions:

| Metric | Value | Implication |
|--------|-------|-------------|
| Total rows | 500 (499 products + 1 header) | Small enough to parse synchronously |
| Columns | 37 | Map all 37 to Product type |
| Test products | 2 (skus 2083, 2100) | Filter by name pattern + brand pattern |
| Products with empty `name` | 2 (skus 85993, 89993) | Not test products -- keep them, name can come from code/model |
| Total image URLs | 998 | All products have at least 1 image |
| Image count distribution | 222x1, 112x2, 125x3, 30x4, 9x5, 2x6 | Cache all per product |
| Image domains | atelier-hub.com (989), coralmatch.com (9) | 2 domains to test connectivity against |
| Image formats | .jpg (989), .jpeg (8), .webp (1) | All standard web formats |
| Colors needing normalization | All 192 (all uppercase) | `toLowerCase().trim()` on every product |
| Products missing description_eng | 498/500 | Primary enrichment target |
| Products missing dimensions | 498/500 | Secondary enrichment target |
| Products with GTIN | 498/500 | Most already have GTINs as JSON arrays |
| Unique brands | 83 | Good variety for enrichment comparison |
| Unique categories | 24 | Fashion/luxury e-commerce domain |
| Departments | 3 (female, male, unisex) | Simple department structure |

## Open Questions

1. **Column count discrepancy (37 vs 38 in success criteria)**
   - What we know: The CSV has exactly 37 columns. The success criteria says "38 columns."
   - What's unclear: Whether there's a miscounted column or an implied computed column.
   - Recommendation: Map all 37 actual columns. The 38th may be `description_eng` which exists as a column header but was miscounted. Proceed with 37 and note in implementation.

2. **Image URL health ratio**
   - What we know: All 998 URLs are from 2 organizations' CDNs (atelier-hub.com, coralmatch.com). Sandbox URLs may be expired.
   - What's unclear: How many are actually reachable (especially the 3 sandbox-guidi.coralmatch.com URLs from test products).
   - Recommendation: The pre-flight check will determine this empirically. Expect most atelier-hub.com URLs to be healthy.

3. **Zod strict vs passthrough**
   - What we know: User left this to Claude's discretion.
   - Recommendation: Use `z.object({...}).passthrough()` for the raw Product schema to be resilient against unexpected columns. Use strict schemas for EnrichedFields and computed types where we control the shape.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | CSV parses into typed Product objects with all 37 columns | unit | `npx vitest run src/parsers/__tests__/csv-reader.test.ts` | Wave 0 |
| PIPE-01 | Embedded JSON columns (images, errors, sizes, gtin) parse correctly | unit | `npx vitest run src/parsers/__tests__/json-columns.test.ts` | Wave 0 |
| PIPE-01 | Zod schema validates and rejects malformed rows | unit | `npx vitest run src/types/__tests__/product.test.ts` | Wave 0 |
| PIPE-06 | Test products (sku 2083, 2100) are filtered out | unit | `npx vitest run src/cleaning/__tests__/filters.test.ts` | Wave 0 |
| PIPE-06 | Colors normalized to lowercase, titles trimmed | unit | `npx vitest run src/cleaning/__tests__/normalizers.test.ts` | Wave 0 |
| PIPE-06 | Cleaning report JSON generated with correct structure | unit | `npx vitest run src/cleaning/__tests__/report.test.ts` | Wave 0 |
| PIPE-06 | Computed metadata columns (_missing_fields, _has_images, _image_count) added | unit | `npx vitest run src/cleaning/__tests__/cleaner.test.ts` | Wave 0 |
| PIPE-02 | HEAD requests check image URL reachability | integration | `npx vitest run src/images/__tests__/preflight.test.ts` | Wave 0 |
| PIPE-02 | Images downloaded to data/images/{sku}_{index}.{ext} | integration | `npx vitest run src/images/__tests__/downloader.test.ts` | Wave 0 |
| PIPE-02 | Image manifest tracks per-URL status | unit | `npx vitest run src/images/__tests__/manifest.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `enrichment/vitest.config.ts` -- Vitest configuration with TypeScript
- [ ] `enrichment/src/parsers/__tests__/csv-reader.test.ts` -- covers PIPE-01 CSV parsing
- [ ] `enrichment/src/parsers/__tests__/json-columns.test.ts` -- covers PIPE-01 JSON parsing
- [ ] `enrichment/src/types/__tests__/product.test.ts` -- covers PIPE-01 schema validation
- [ ] `enrichment/src/cleaning/__tests__/filters.test.ts` -- covers PIPE-06 test product filtering
- [ ] `enrichment/src/cleaning/__tests__/normalizers.test.ts` -- covers PIPE-06 normalization
- [ ] `enrichment/src/cleaning/__tests__/report.test.ts` -- covers PIPE-06 reporting
- [ ] `enrichment/src/cleaning/__tests__/cleaner.test.ts` -- covers PIPE-06 metadata columns
- [ ] `enrichment/src/images/__tests__/preflight.test.ts` -- covers PIPE-02 HEAD checks
- [ ] `enrichment/src/images/__tests__/downloader.test.ts` -- covers PIPE-02 downloads
- [ ] `enrichment/src/images/__tests__/manifest.test.ts` -- covers PIPE-02 manifest
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

## Sources

### Primary (HIGH confidence)
- CSV data analysis: Direct examination of `originalUnEnrichedProductFeed.csv` (500 rows, 37 columns) -- all data metrics verified empirically
- Node.js 25.2.1: Verified on local machine (`node --version`), native TypeScript type-stripping confirmed stable
- [PapaParse npm](https://www.npmjs.com/package/papaparse) - v5.5.3, TypeScript types via @types/papaparse
- [Zod official docs](https://zod.dev/api) - v3.24.x schema API, coerce, infer
- [PapaParse docs](https://www.papaparse.com/docs) - parse config (header, skipEmptyLines, dynamicTyping)

### Secondary (MEDIUM confidence)
- [p-limit npm](https://www.npmjs.com/package/p-limit) - v7.3.0, ESM-only, concurrency control
- [Vitest](https://vitest.dev/) - v4.x, recommended testing framework for 2026 TypeScript projects
- [Node.js native TS docs](https://nodejs.org/api/typescript.html) - type-stripping stable in Node 25.2.0+
- [Node.js stream/promises pipeline](https://nodejs.org/en/learn/modules/how-to-use-streams) - file download pattern

### Tertiary (LOW confidence)
- Image URL reachability: Cannot verify without actually making HTTP requests. The 3 sandbox-guidi.coralmatch.com URLs are likely unreachable (belong to test products that will be filtered anyway).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PapaParse, Zod, p-limit are well-established; versions verified via npm
- Architecture: HIGH - Standard TypeScript project patterns; data shape fully analyzed from actual CSV
- Pitfalls: HIGH - Identified from direct data analysis (JSON columns, GTIN arrays, color normalization) and library documentation
- Data insights: HIGH - All metrics derived from actual CSV examination

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable libraries, unlikely to change)

# Architecture Patterns

**Domain:** Product data enrichment evaluation pipeline + comparison UI
**Researched:** 2026-03-13

## Recommended Architecture

```
product-enrichment-eval/
|
|-- shared/                     # Shared types & utilities (no runtime deps)
|   |-- types.ts                # Product, EnrichedFields, EnrichmentResult
|   |-- schemas.ts              # Zod schemas for validation
|   `-- constants.ts            # Field names, tool names, enrichment fields list
|
|-- enrichment/                 # CLI enrichment pipeline (Node.js)
|   |-- src/
|   |   |-- adapters/           # One file per enrichment tool
|   |   |   |-- types.ts        # EnrichmentAdapter interface
|   |   |   |-- claude.ts
|   |   |   |-- gemini.ts
|   |   |   |-- firecrawl.ts
|   |   |   |-- perplexity.ts
|   |   |   |-- apify.ts        # stretch
|   |   |   `-- zyte.ts         # stretch
|   |   |-- url-discovery/      # SerpAPI Google Lens URL discovery (DETACHED)
|   |   |   |-- serpapi-lens.ts # Visual search via SerpAPI Google Lens
|   |   |   |-- url-manifest.ts # Read/write URL manifest (data/serpapi-urls.json)
|   |   |   `-- run-discovery.ts# CLI entry point for URL discovery
|   |   |-- csv/                # CSV read/write utilities
|   |   |   |-- reader.ts       # Parse base CSV with PapaParse
|   |   |   `-- writer.ts       # Write enriched CSV output
|   |   |-- prompts/            # LLM prompt templates
|   |   |   |-- enrichment.ts   # Core enrichment prompt builder
|   |   |   `-- validation.ts   # Prompt for self-validation (optional)
|   |   |-- images/             # Image fetching & encoding
|   |   |   `-- fetch.ts        # Download image, return base64
|   |   |-- runner/             # Orchestration logic
|   |   |   |-- batch.ts        # Process N products through one adapter
|   |   |   |-- checkpoint.ts   # Save/resume progress (JSON file)
|   |   |   `-- report.ts       # Summary stats after run
|   |   |-- config.ts           # Env vars, concurrency settings
|   |   `-- run.ts              # CLI entry point
|   |-- .env.example
|   |-- package.json
|   `-- tsconfig.json
|
|-- frontend/                   # React comparison UI (Vite)
|   |-- src/
|   |   |-- hooks/
|   |   |   |-- useProducts.ts  # Load & parse all CSVs
|   |   |   |-- useFilters.ts   # Filter state management
|   |   |   `-- useScoring.ts   # Client scoring (localStorage)
|   |   |-- components/
|   |   |   |-- App.tsx
|   |   |   |-- ProductGrid.tsx
|   |   |   |-- ProductCard.tsx
|   |   |   |-- FilterBar.tsx
|   |   |   |-- ScoringPanel.tsx
|   |   |   |-- FieldDiff.tsx
|   |   |   |-- ImageGallery.tsx
|   |   |   |-- AggregateReport.tsx
|   |   |   `-- ProductNav.tsx
|   |   |-- utils/
|   |   |   |-- csv-loader.ts   # PapaParse wrapper for loading CSVs
|   |   |   |-- diff.ts         # Field comparison logic
|   |   |   `-- scoring.ts      # Scoring persistence & aggregation
|   |   `-- main.tsx
|   |-- public/
|   |   `-- data/               # CSV files served statically
|   |-- package.json
|   `-- vite.config.ts
|
|-- data/                       # Output directory for enriched CSVs
|   |-- base.csv                # Normalized copy of original
|   |-- enriched-claude.csv
|   |-- enriched-gemini.csv
|   |-- enriched-firecrawl.csv
|   |-- enriched-perplexity.csv
|   |-- serpapi-urls.json        # SerpAPI URL discovery manifest (SKU -> URLs)
|   `-- checkpoints/            # Progress files per tool
|
`-- originalUnEnrichedProductFeed.csv
```

### Why This Structure

**Two independent packages (enrichment + frontend), not a monorepo framework.** The enrichment pipeline is a Node.js CLI tool; the frontend is a Vite/React app. They share a data contract (CSV format) but no runtime code. A shared types directory keeps them aligned without coupling them. This avoids monorepo tooling overhead (Turborepo, Nx) for what is a prototype evaluation project.

**Adapters directory, not tools directory.** The name "adapters" signals the design pattern: each file wraps a different external API behind a common interface. This is the textbook Adapter Pattern for multi-provider integrations.

**Runner separated from adapters.** The batch processing, checkpointing, and reporting logic is orthogonal to the API adapters. Keeping them separate means you can change concurrency strategy or add resume-from-checkpoint without touching adapter code.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **shared/types** | Type definitions & Zod schemas | Imported by enrichment + frontend |
| **enrichment/adapters** | Wrap each API behind `EnrichmentAdapter` interface | Called by runner; call external APIs |
| **enrichment/csv** | Read base CSV, write enriched CSVs | Called by runner; reads/writes filesystem |
| **enrichment/prompts** | Build LLM prompts from product data | Called by LLM adapters (claude, gemini, perplexity) |
| **enrichment/images** | Fetch product images, encode as base64 | Called by LLM adapters needing vision input |
| **enrichment/runner** | Orchestrate batch processing with concurrency + checkpoints | Calls adapters + csv; writes checkpoint files |
| **enrichment/run.ts** | CLI interface, parse args, invoke runner | Entry point; calls runner |
| **frontend/hooks** | Load CSVs, manage filter/scoring state | Called by React components |
| **frontend/components** | Render comparison UI | Use hooks; read from localStorage |
| **enrichment/url-discovery** | SerpAPI Google Lens visual search for product page URLs | Reads cached images from data/images/; writes data/serpapi-urls.json |
| **data/** | CSV file storage + URL manifest (output of enrichment, input to frontend) | Written by enrichment + url-discovery, read by frontend |

### Critical Boundary: CSV as the Data Contract

The enrichment pipeline and the frontend never communicate directly. The CSV files in `data/` are the contract between them. This is deliberate:

- **Decoupled development:** Frontend can be built with mock CSVs before enrichment scripts are ready.
- **Reproducible:** Re-run enrichment without touching the frontend. Swap in new CSVs and the UI just works.
- **Debuggable:** CSVs are human-readable. Open them in a spreadsheet to verify enrichment quality independently of the UI.

---

## Data Flow

### SerpAPI URL Discovery (DETACHED Write Path)

```
data/images/{sku}_{index}.{ext}  (from Phase 1 image pre-flight)
        |
        v
  [SerpAPI Lens] -- For each product with cached images:
        |
        |--- Check checkpoint: already discovered? Skip.
        |
        |--- Send image to SerpAPI Google Lens endpoint
        |       |
        |       v
        |   SerpAPI returns: visual_matches[], product_results[]
        |       |
        |       v
        |   Rank and select best product page URLs
        |
        |--- Save to URL manifest + checkpoint
        |
        v
  data/serpapi-urls.json  -- { [sku]: { urls: [...], confidence: ..., resultCount: ... } }
```

### Enrichment Pipeline (Write Path)

```
originalUnEnrichedProductFeed.csv
        |
        v
  [CSV Reader] -- PapaParse parses CSV into Product[] array
        |
        v
  [Runner/Batch] -- For each product, for one tool at a time:
        |
        |--- Check checkpoint: already processed? Skip.
        |
        |--- [URL Manifest Lookup] -- OPTIONAL: check data/serpapi-urls.json
        |       for discovered product page URLs (only for scraping adapters)
        |
        |--- [Image Fetcher] -- Download first image URL, return base64
        |       (only for LLM adapters: Claude, Gemini)
        |
        |--- [Prompt Builder] -- Build enrichment prompt from product fields
        |       (only for LLM/search adapters)
        |
        |--- [Adapter.enrich(product, discoveredUrl?)] -- Call external API
        |       |
        |       v
        |   External API (Claude/Gemini/FireCrawl/Perplexity/etc.)
        |       |
        |       v
        |   Raw response (JSON or markdown)
        |       |
        |       v
        |   [Zod Schema Validation] -- Parse & validate EnrichedFields
        |
        |--- Save checkpoint (product SKU + status)
        |
        v
  [CSV Writer] -- Merge enriched fields into product, write enriched CSV
        |
        v
  data/enriched-{tool}.csv + data/checkpoints/{tool}.json
```

### Comparison UI (Read Path)

```
  data/base.csv + data/enriched-*.csv
        |
        v
  [Vite public/ or fetch] -- Served as static files
        |
        v
  [useProducts hook] -- PapaParse.parse() each CSV
        |                  Index products by SKU across all CSVs
        |                  Build: Map<SKU, Map<ToolName, Product>>
        |
        v
  [useFilters hook] -- Client filters: brand, category, department,
        |                enrichment completeness, tool subset
        |
        v
  [ProductNav] -- Select product (paginated list, search)
        |
        v
  [ProductGrid] -- For selected product, show N cards side by side
        |               (one per enrichment tool)
        |
        |--- [ProductCard] -- Image + all fields + enrichment badges
        |       |
        |       |--- [FieldDiff] -- Highlight enriched vs. original
        |       |
        |       `--- [ImageGallery] -- Product images
        |
        |--- [ScoringPanel] -- 1-5 star rating per tool per product
        |       |                Persists to localStorage
        |       |
        |       `--- [AggregateReport] -- Rollup: % filled, avg score,
        |                                  best/worst per category
        |
        v
  localStorage -- { scores: { [sku]: { [tool]: rating } } }
```

---

## Patterns to Follow

### Pattern 1: Adapter Interface

**What:** Every enrichment tool implements the same interface. The runner does not know which tool it is calling.

**When:** Always. This is the core architectural decision.

**Example:**

```typescript
// shared/types.ts
interface EnrichedFields {
  readonly description_eng: string | null
  readonly season: string | null
  readonly year: number | null
  readonly collection: string | null
  readonly gtin: string | null
  readonly dimensions: string | null
}

interface EnrichmentResult {
  readonly fields: EnrichedFields
  readonly status: 'success' | 'partial' | 'failed'
  readonly enrichedFieldNames: readonly string[]
  readonly error?: string
  readonly metadata: {
    readonly durationMs: number
    readonly tokensUsed?: number
    readonly creditsUsed?: number
  }
}

// enrichment/adapters/types.ts
interface EnrichmentAdapter {
  readonly name: string
  enrich(product: Product, discoveredUrl?: string): Promise<EnrichmentResult>
  // discoveredUrl is OPTIONAL — from SerpAPI URL discovery manifest
  // Adapters work with or without it. Scraping adapters (FireCrawl) use it
  // to target the actual product page instead of searching by text.
}
```

**Why:** Adding a new tool means creating one file that implements this interface. No changes to the runner, CSV writer, or any other component. The runner iterates over adapters polymorphically. The optional `discoveredUrl` parameter allows scraping adapters to benefit from SerpAPI URL discovery without any coupling — adapters that don't use it simply ignore it.

### Pattern 2: Checkpoint/Resume for Batch Processing

**What:** After each product is processed, write its status to a JSON checkpoint file. On restart, skip already-processed products.

**When:** Always for the enrichment pipeline. Processing 500 products across 4-7 APIs takes hours and will fail partway through.

**Example:**

```typescript
// enrichment/runner/checkpoint.ts
interface Checkpoint {
  readonly tool: string
  readonly processedSkus: ReadonlyMap<string, 'success' | 'partial' | 'failed'>
  readonly startedAt: string
  readonly lastUpdated: string
}

function loadCheckpoint(tool: string): Checkpoint | null {
  // Read from data/checkpoints/{tool}.json
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  // Write to data/checkpoints/{tool}.json
  // Atomic write: write to .tmp then rename
}

function isProcessed(checkpoint: Checkpoint, sku: string): boolean {
  return checkpoint.processedSkus.has(sku)
}
```

**Why:** API calls cost money. Re-running 500 products because one failed at #347 is wasteful. Checkpoints make the pipeline idempotent and resumable.

### Pattern 3: Zod Schema Validation at API Boundaries

**What:** Validate every API response against a Zod schema before using the data. Never trust raw API output.

**When:** Every adapter, every response.

**Example:**

```typescript
import { z } from 'zod'

const EnrichedFieldsSchema = z.object({
  description_eng: z.string().nullable(),
  season: z.string().nullable(),
  year: z.number().int().min(1900).max(2030).nullable(),
  collection: z.string().nullable(),
  gtin: z.string().regex(/^\d{13}$/).nullable(),
  dimensions: z.string().nullable(),
})

// In adapter:
function parseResponse(raw: unknown): EnrichedFields {
  const parsed = EnrichedFieldsSchema.safeParse(raw)
  if (!parsed.success) {
    // Log validation errors, return partial result
    return extractValidFields(raw, parsed.error)
  }
  return parsed.data
}
```

**Why:** LLMs hallucinate. Scraping tools return garbage. Zod catches invalid GTINs, impossible years, and malformed data before it hits the CSV.

### Pattern 4: Prompt Builder with Product Context

**What:** A single function that takes a Product and returns a prompt string. All LLM adapters (Claude, Gemini, Perplexity) use the same prompt builder with tool-specific wrappers.

**When:** For all LLM-based adapters.

**Example:**

```typescript
// enrichment/prompts/enrichment.ts
function buildEnrichmentPrompt(product: Product, missingFields: string[]): string {
  const context = {
    name: product.name,
    brand: product.brand,
    model: product.model,
    color: product.color,
    category: product.category,
    materials: product.materials_original,
    season_raw: product.season_raw,
  }

  return `You are a product data specialist for luxury fashion e-commerce.
Given the following product information, fill in the missing fields.

Product: ${JSON.stringify(context, null, 2)}

Missing fields: ${missingFields.join(', ')}

Rules:
- description_eng: Professional English description, 2-3 sentences
- season: "FW" or "SS" format
- year: 4-digit year
- collection: Collection name if identifiable
- gtin: Only if you can identify the exact 13-digit barcode
- dimensions: Physical dimensions if inferable
- Leave fields empty (null) rather than guess

Respond as JSON matching this schema:
{ "description_eng": "...", "season": "...", "year": ..., "collection": "...", "gtin": "...", "dimensions": "..." }`
}
```

**Why:** Consistent prompting across LLMs makes comparison fair. The prompt is the independent variable you want to hold constant while the model varies.

### Pattern 5: CSV Data Loading in Frontend

**What:** Load all CSVs at startup, index by SKU, build a lookup structure for O(1) product comparison.

**When:** Frontend initialization.

**Example:**

```typescript
// frontend/hooks/useProducts.ts
interface ProductIndex {
  readonly skus: readonly string[]
  readonly base: ReadonlyMap<string, Product>
  readonly enriched: ReadonlyMap<string, ReadonlyMap<string, Product>>
  // enriched.get(sku)?.get('claude') -> enriched product
}

function useProducts(): { data: ProductIndex | null; loading: boolean } {
  // 1. Fetch base.csv + all enriched-*.csv from /data/
  // 2. PapaParse.parse() each one
  // 3. Index by SKU into maps
  // 4. Return unified ProductIndex
}
```

**Why:** 500 products x 7 tools = 3500 product records. Small enough to hold in memory. Indexing by SKU makes the side-by-side comparison O(1) per product.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Runtime Package

**What:** Creating an npm package or shared lib that both enrichment and frontend import at build time.

**Why bad:** Introduces build coupling between two independent tools. The enrichment CLI has Node.js dependencies (fs, path, API SDKs); the frontend is a browser app. Sharing runtime code means fighting with bundler configs, conditional imports, and Node.js polyfills in Vite.

**Instead:** Share types via a plain TypeScript directory with no runtime dependencies. The CSV format is the real integration contract. Duplicate simple utility functions if needed (a few lines of field-name constants are cheaper than build complexity).

### Anti-Pattern 2: Processing All Tools in Parallel

**What:** Running all 4-7 enrichment tools simultaneously for each product.

**Why bad:** Concurrent API calls across 4+ providers with 500 products each = 2000+ simultaneous requests. Rate limits hit immediately. Costs spike from retries. Errors cascade. Debugging becomes impossible.

**Instead:** Run one tool at a time, sequentially. Within a single tool's run, use `p-limit` for concurrency (3-5 concurrent requests per tool). This keeps costs predictable, simplifies debugging, and respects rate limits.

### Anti-Pattern 3: Storing Enrichment Results in the UI State Only

**What:** Running enrichment from the frontend or storing results only in memory/localStorage.

**Why bad:** 500 products x 7 tools is a lot of data to manage in browser state. Losing it on page refresh would be catastrophic. Running expensive API calls from the browser means no checkpointing.

**Instead:** Enrichment is a CLI process that writes to disk (CSVs). The frontend is a read-only viewer of those CSVs. Clear separation of write path (CLI) and read path (UI).

### Anti-Pattern 4: Over-Engineering the Scoring System

**What:** Building a backend API + database for client scoring.

**Why bad:** This is a prototype evaluation tool. Building auth, a database, and API endpoints for scoring is weeks of work for a feature that serves maybe 2-3 people evaluating results once.

**Instead:** localStorage for scores. If the client needs to share scores, add a CSV export button. If they need persistence, upgrade to a JSON file on disk later.

---

## Scalability Considerations

| Concern | At 500 products (current) | At 5K products (next eval) | At 50K products (production) |
|---------|---------------------------|----------------------------|------------------------------|
| **Enrichment time** | ~2-4 hours total across 4 tools | ~20-40 hours; need overnight runs | Out of scope for this tool; need queue-based architecture |
| **CSV file size** | ~1-2MB per tool; fine | ~10-20MB per tool; still fine for PapaParse | Switch to streaming parse or database |
| **Frontend load** | All in memory; instant | All in memory; ~2s load | Virtualization + pagination or backend API |
| **Cost** | ~$20-30 total | ~$200-300; needs budget approval | Needs cost-optimization layer (caching, dedup) |
| **Checkpoint files** | ~50KB JSON | ~500KB JSON; fine | Switch to SQLite or LevelDB |

For the current 500-product evaluation, everything fits comfortably in memory and on disk. No infrastructure needed beyond the filesystem.

---

## Suggested Build Order (Dependencies)

The components have natural dependency chains that determine build order:

```
Phase 1: Foundation (no external dependencies)
  shared/types.ts
  shared/schemas.ts
  enrichment/csv/reader.ts
  enrichment/csv/writer.ts
      |
      v
Phase 2: Enrichment Infrastructure (depends on Phase 1)
  enrichment/images/fetch.ts
  enrichment/prompts/enrichment.ts
  enrichment/runner/checkpoint.ts
  enrichment/runner/batch.ts
  enrichment/config.ts
      |
      v
Phase 3: Adapters (depends on Phase 2)
  enrichment/adapters/claude.ts    \
  enrichment/adapters/gemini.ts     } Can be built in parallel
  enrichment/adapters/firecrawl.ts  } once the interface exists
  enrichment/adapters/perplexity.ts/
      |
      v
Phase 4: CLI Runner (depends on Phase 3)
  enrichment/run.ts
  enrichment/runner/report.ts
  Actually run enrichment -> produce CSVs
      |
      v
Phase 5: Frontend (depends on Phase 4 CSVs, but can start with mocks in Phase 2)
  frontend/ (Vite + React)
  Can use mock CSVs during Phase 2-4, swap real data in Phase 5
      |
      v
Phase 5 (DETACHED): SerpAPI URL Discovery (independent, parallel with 2-4)
  enrichment/url-discovery/serpapi-lens.ts
  enrichment/url-discovery/url-manifest.ts
  enrichment/url-discovery/run-discovery.ts
  Output: data/serpapi-urls.json (optional input for scraping adapters)

Phase 6: Stretch Adapters + Polish (independent)
  enrichment/adapters/apify.ts
  enrichment/adapters/zyte.ts
  frontend/AggregateReport.tsx
```

**Key insight:** The frontend can be developed in parallel with enrichment Phases 2-4 using mock CSV data. Create a `data/mock-enriched-claude.csv` with 10 hand-written products and build the entire UI against it. When real enrichment CSVs arrive, the UI just works because the CSV format is the contract.

### Build Order Rationale

1. **Types and CSV utilities first** because every other component depends on `Product` and `EnrichedFields` types, and the ability to read/write CSVs.
2. **Infrastructure before adapters** because the image fetcher, prompt builder, and checkpoint system are shared across all adapters. Building them first means each adapter is a thin wrapper.
3. **Adapters can be parallel** because they are independent implementations of the same interface. One developer can build Claude while another builds FireCrawl.
4. **CLI runner after adapters** because it orchestrates them. But the batch/checkpoint logic can be built earlier with a mock adapter.
5. **Frontend can overlap** because it depends only on CSV format, not on enrichment code. Start with mock data.
6. **SerpAPI URL Discovery is detached** because it is an independent module that only needs cached images from Phase 1. It produces an optional URL manifest consumed by scraping adapters. Can be built by a separate developer in parallel with Phases 2-4.
7. **Stretch adapters last** because they are lower priority and the architecture already supports adding new adapters trivially.

---

## Key Technical Decisions

### Use Native SDKs, Not Vercel AI SDK

**Decision:** Use each provider's native TypeScript SDK (Anthropic SDK, Google Generative AI SDK, etc.) rather than a unified SDK like Vercel AI SDK.

**Rationale:** The Vercel AI SDK provides a unified interface across 20+ providers, which is valuable for production apps that need provider switching. But this is an evaluation project where the *whole point* is to compare providers. Using native SDKs gives:

- Full access to provider-specific features (Claude's structured output beta, Gemini's grounding, Perplexity's citations)
- Better control over request parameters per provider
- No abstraction layer hiding provider-specific behavior that might affect enrichment quality
- Simpler dependency tree for a prototype

The custom `EnrichmentAdapter` interface provides the unified abstraction layer needed, without the weight of a framework.

### CSV in `public/` for Frontend

**Decision:** Copy enriched CSVs into `frontend/public/data/` and load them via `fetch()` + PapaParse.

**Rationale:** Vite serves files from `public/` as-is. No import magic, no bundler plugins, no `?url` suffixes. The frontend just fetches `/data/enriched-claude.csv` like any static file. This also means CSVs can be updated without rebuilding the frontend.

### localStorage for Scoring

**Decision:** Store client ratings in localStorage, with CSV export.

**Rationale:** Zero backend. Zero setup. The client opens the app, rates tools, and scores persist across page loads. When they are done, they export scores as CSV. This is a prototype for 1-3 evaluators, not a multi-tenant SaaS.

---

## Sources

- [Pipeline Pattern in Software Architecture](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn) - MEDIUM confidence
- [Adapter Design Pattern for Multiple Third-Party Integrations](https://medium.com/@olorondu_emeka/adapter-design-pattern-a-guide-to-manage-multiple-third-party-integrations-dc342f435daf) - MEDIUM confidence
- [Anthropic Structured Outputs (Nov 2025)](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - HIGH confidence
- [zod-gpt for Multi-Provider Structured Output](https://github.com/dzhng/zod-gpt) - MEDIUM confidence
- [LLM Structured Output Best Practices 2026](https://dev.to/pockit_tools/llm-structured-output-in-2026-stop-parsing-json-with-regex-and-do-it-right-34pk) - MEDIUM confidence
- [p-limit for Concurrency Control](https://github.com/sindresorhus/p-limit) - HIGH confidence
- [PapaParse with React and Vite](https://medium.com/@niveditamahato2001/how-to-parse-or-read-csv-files-in-vite-reactjs-deb4596df218) - MEDIUM confidence
- [TanStack Virtual for Large Lists](https://medium.com/@sanjivchaudhary416/from-lag-to-lightning-how-tanstack-virtual-optimizes-1000s-of-items-smoothly-24f0998dc444) - MEDIUM confidence
- [Vercel AI SDK (considered, not recommended for this use case)](https://ai-sdk.dev/docs/introduction) - HIGH confidence
- [Multi-LLM Evaluation Framework Architecture](https://www.nature.com/articles/s41598-025-15203-5) - MEDIUM confidence
- [Vite Static Asset Handling](https://vite.dev/guide/assets) - HIGH confidence

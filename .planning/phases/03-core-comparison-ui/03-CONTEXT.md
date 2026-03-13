# Phase 3: Core Comparison UI - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

React app where the client can browse all products, view side-by-side enrichment results from all tools, visually see what changed via color-coded diffs, filter the dataset, and see LLM-generated accuracy scores per product. Manual client scoring removed — replaced by LLM self-scoring (defined in Phase 2). Can start development with mock CSVs before Phase 2 enrichment runs complete.

</domain>

<decisions>
## Implementation Decisions

### Product Browsing Layout
- Persistent sidebar list with product thumbnail, brand name, and product name per item
- Virtual scroll for all 498 products (no pagination)
- Search box + filter dropdowns (brand, category, department) at top of sidebar
- Collapsible sidebar — toggle to thin rail for more comparison space
- Default sort: alphabetical by brand, then product name within brand
- Auto-select first product on page load (no empty welcome state)
- Mouse-only navigation (no keyboard shortcuts)
- "Showing N of 498 products" match count when filters are active

### Side-by-Side Card Arrangement
- 2x2 grid layout (e.g., Claude/Gemini top row, FireCrawl/Perplexity bottom row)
- Shared product header above the grid: product image, brand, name, SKU, category + collapsible "Original Data" section showing pre-enrichment field values as baseline reference
- Each card shows: tool name, completeness count (N/M fields filled — dynamic, not hardcoded to 6), LLM accuracy score (if available from Phase 2), enrichment status badge (success/partial/failed)
- Color-coded field rows with left border: GREEN = enriched (tool filled this field), GRAY = unchanged (already in original), AMBER = targeted but empty (tool couldn't fill)
- Core target fields displayed first, expandable "Additional Fields" section below for any extra fields the tool filled beyond the core set
- Description field (description_eng) truncated to ~100 chars with "Show more" toggle for inline expansion
- Failed tool cards: dimmed/grayed out, error message displayed, card maintains grid slot
- Fields filled count on each card header as quick comparison metric

### Styling & Visual Design
- Tailwind CSS (no component library)
- Clean & professional light theme for client presentation
- Color palette: white/gray-50 background, gray-900 text, white cards with gray-200 borders, green-500/100 for enriched, gray-400/100 for unchanged, amber-500/100 for missing, red-500/100 for failed, blue-600 accent
- Minimal header: "Product Enrichment Eval" title + product count summary

### Responsive Design
- Fully responsive — optimized for all screen sizes
- Desktop (1280px+): sidebar + 2x2 grid (primary layout)
- Tablet (768-1024px): sidebar collapses to drawer, 2x2 grid maintained
- Mobile (<768px): bottom sheet for product list, cards stacked in single column vertically

### Data Loading
- All CSVs loaded in parallel at startup (base.csv + all enriched-{tool}.csv files)
- Copy CSVs and images to frontend/public/ via npm script: `cp ../data/*.csv public/data/ && cp -r ../data/images/ public/images/`
- Generate mock enriched CSVs from base.csv for development before Phase 2 completes (random fill rates 60-90%, placeholder descriptions, some deliberate failures)
- Import shared types (Product, EnrichedFields) directly from enrichment/src/types/ — not duplicated
- Skeleton UI (layout with gray pulsing placeholders) while data loads

### URL Routing
- Product selection and filter state reflected in URL query params: `?product=AB123&brand=Gucci&dept=Shoes`
- Browser back/forward navigation works with product/filter changes
- Shareable/bookmarkable URLs for specific product comparisons

### Error & Empty States
- Missing tool CSVs: gracefully skip, show only available tools (adaptive grid — 1, 2, or 3 cards instead of 4). Header shows which tools have/lack data
- No enrichment data at all: sidebar shows products from base.csv, comparison area shows helpful message with instructions to run enrichment
- Broken/missing images: gray placeholder box with icon and "No image" text — maintains layout

### Claude's Discretion
- Exact virtual scroll library choice (react-window, tanstack-virtual, etc.)
- Sidebar collapsed rail design (icon style, width)
- Bottom sheet library for mobile
- Skeleton component design details
- Exact Tailwind config and spacing scale
- Card shadow/border radius values
- Font choices within Tailwind defaults
- Error boundary component design

</decisions>

<specifics>
## Specific Ideas

- Layout inspired by Linear/Notion — clean, professional, not cluttered
- Product header above grid avoids repeating the same image 4 times across cards
- Collapsible "Original Data" in product header provides baseline reference without cluttering the comparison cards
- "Show more" expand on descriptions keeps cards compact and aligned while allowing full text when needed
- Dynamic field count (N/M) instead of hardcoded 6/6 — tools may enrich fields beyond the core set (Phase 1 hybrid enrichment approach)
- LLM accuracy score display on cards — Phase 2 will define how scores are generated, Phase 3 just displays whatever score is in the enriched CSV

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `enrichment/src/types/product.ts`: ProductSchema (Zod) and Product type — 38+ columns with metadata columns (_missing_fields, _has_images, _image_count)
- `enrichment/src/types/enriched.ts`: EnrichedFieldsSchema with 6 core fields (description_eng, season, year, collection, gtin, dimensions)
- `enrichment/src/types/index.ts`: Re-exports all types — frontend imports from here
- `enrichment/src/parsers/csv-reader.ts`: PapaParse-based CSV reader with Zod validation — can inform frontend CSV parsing approach
- `data/base.csv`: 498 cleaned products ready for display
- `data/images/`: Cached product images (~990 files, 497 products with images)
- `data/image-manifest.json`: Maps image URLs to local paths and status

### Established Patterns
- Zod v3.25 for schema validation (pinned, not v4)
- PapaParse for CSV parsing
- TypeScript with ESM modules (.js extensions in imports)
- Vitest for testing
- tsx for script execution
- Enriched CSV format: base columns + _enriched_fields, _enrichment_tool, _enrichment_status, _enrichment_error metadata columns

### Integration Points
- Frontend imports types from `enrichment/src/types/` — needs TypeScript path alias or npm workspace
- Frontend reads CSVs from `public/data/` (copied from `data/`)
- Frontend reads images from `public/images/` (copied from `data/images/`)
- Phase 2 enriched CSVs follow naming convention: `data/enriched-{tool}.csv`
- Phase 4 (Analysis & Reporting) will build on top of this UI — keep component structure extensible

</code_context>

<deferred>
## Deferred Ideas

- Manual client scoring system (1-5 stars) — removed from scope; replaced by LLM self-scoring in Phase 2
- Aggregate dashboard and per-field winner analysis — Phase 4
- CSV export of results — Phase 4
- Weighted quality scores — Phase 4
- Keyboard shortcuts for rapid navigation — explicitly deferred (mouse-only for now)

</deferred>

---

*Phase: 03-core-comparison-ui*
*Context gathered: 2026-03-13*

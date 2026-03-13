# Feature Research

**Domain:** Product Data Enrichment Evaluation / Tool Comparison Dashboard
**Researched:** 2026-03-13
**Confidence:** HIGH

## Feature Landscape

This is an internal validation tool presented to a client comparing how well 4-7 enrichment tools fill missing product data across ~500 products. The feature set is informed by: (1) PIM/data quality dashboard conventions from Akeneo, Salsify, WISEPIM, Pimberly; (2) LLM evaluation leaderboard patterns from LMSYS Arena, Artificial Analysis, Hugging Face; (3) Amazon Science research on hallucination detection in LLM-enriched product listings; and (4) data enrichment quality metrics from Derrick App.

### Table Stakes (Users Expect These)

Features the client expects from a comparison tool. Missing these = the tool fails its purpose.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Side-by-side product cards per tool | Core purpose of the tool -- client needs to visually compare how each tool enriched the same product | MEDIUM | One column per tool, same product across all. Layout must handle 4-7 columns gracefully (horizontal scroll or selectable subset). |
| Visual diff: original vs enriched | Client must see WHAT changed, not just that something exists. Without this, they cannot assess quality. | MEDIUM | Color-coded highlighting: green for newly filled fields, amber for modified values, gray for unchanged. Per-field, not per-product. |
| Field completeness metrics per tool | The #1 quantitative metric: what % of fields did each tool actually fill? Completeness rate = (filled fields / total missing fields) x 100. | LOW | Calculate per-field and per-tool. Show as percentage and as raw counts. This is table stakes in every PIM quality dashboard. |
| Filtering by brand, category, department | 500 products are too many to browse linearly. Client needs to slice by product attributes to evaluate tool performance within specific segments (e.g., "how does Claude do on shoes vs bags?"). | LOW | Multi-select filters. Include: brand, category, department, and enrichment status (complete/partial/failed). |
| Product image display | Product context is meaningless without seeing the actual item. Images are already in the feed data. | LOW | Show first 1-3 images per product. Lazy-load to keep UI snappy. Fallback placeholder for broken URLs. |
| Per-product quality scoring (client ratings) | Client needs to manually rate output quality because automated metrics cannot capture "this description sounds wrong" or "this is clearly hallucinated." Human-in-the-loop is essential for evaluation credibility. | MEDIUM | 1-5 star rating per tool per product. Persist in localStorage. Must be quick to use -- the client will rate hundreds of products. |
| Aggregate summary dashboard | Client needs a top-level view to compare tools without browsing individual products. "Which tool wins overall?" is the first question they ask. | MEDIUM | Per-tool: fill rate per field, average client score, total products enriched successfully vs failed. Table or bar chart format. |
| Product navigation / browsing | Must be able to browse through all 500 products efficiently, not just random access. | LOW | Paginated list or virtual scroll with product name, brand, and enrichment status preview. Click to open detail comparison. |
| Enrichment status indicators | At a glance, client needs to know: did this tool succeed, partially succeed, or fail for this product? | LOW | Badge system: "Complete" (all fields filled), "Partial" (some fields), "Failed" (error/no fields). Use the `_enrichment_status` column from enriched CSVs. |
| Missing field badges | For each product-tool pair, show which specific fields are still missing after enrichment. | LOW | Small badges or icons per field showing filled/empty state. Critical for understanding per-field strengths of each tool. |

### Differentiators (Competitive Advantage)

Features that make this tool more persuasive and insightful than a spreadsheet comparison. Not required, but elevate the client presentation significantly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Weighted quality score per tool | Go beyond simple fill rate. Weight fields by business importance (description >> dimensions) to produce a single composite score per tool. Mirrors WISEPIM/CatalogIQ multi-dimension scoring. | LOW | Define weights: description_eng (10), season (5), year (5), collection (3), gtin (8), dimensions (2). Compute weighted completeness. Display as single number + breakdown. |
| Per-field winner analysis | For each enrichment field, show which tool performs best. "Claude wins on descriptions, FireCrawl wins on GTIN." This is the actionable insight the client actually needs. | LOW | Simple table: field x tool matrix with fill rates. Highlight winner per row. Extremely high value-to-effort ratio. |
| Confidence/hallucination flagging | LLMs hallucinate product data. Flag suspiciously generated content: descriptions that are generic, GTINs that fail checksum validation, dimensions that seem implausible. Amazon Science research confirms this is a critical concern for LLM-enriched listings. | HIGH | GTIN checksum validation is straightforward. Description quality detection (generic vs specific) is harder -- could use length + keyword heuristics. Mark fields with confidence indicators. |
| Export scoring results as CSV | Client takes evaluation results back to their team. A downloadable report makes the tool's findings portable and sharable beyond the demo. | LOW | Export: product ID, tool name, per-field scores, client rating, weighted score. Simple CSV download button. |
| Filter by enrichment quality tier | Let client quickly find "show me only products where Claude scored 5 stars" or "show me products no tool could enrich." Enables targeted quality analysis. | LOW | Additional filter options: by client rating range, by fill completeness threshold, by specific tool performance. |
| Cost-per-enrichment comparison | Client cares about ROI, not just quality. Show estimated cost per product per tool alongside quality metrics. Helps answer "is Claude's better quality worth 3x the cost?" | LOW | Use known API pricing from PLAN.md estimates. Display as cost column in aggregate view. Static data, not dynamic calculation. |
| Category/brand performance heatmap | Show which tools excel for which product categories. "Gemini is great for shoes but poor for accessories" is a nuanced insight that drives adoption decisions. | MEDIUM | Matrix view: rows = categories/brands, columns = tools, cells = fill rate or avg score. Color-coded heatmap. Requires enough data per category to be meaningful. |
| Keyboard shortcuts for rapid scoring | If client is rating 500 products across 4 tools, mouse-clicking stars is painfully slow. Keyboard navigation (arrow keys to browse, number keys to rate) makes bulk evaluation feasible. | LOW | 1-5 number keys for rating, arrow keys for navigation between products and tools. Small implementation cost, major UX improvement for the scoring workflow. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but would waste time, add complexity, or undermine the tool's purpose.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time enrichment from the UI | "Click a button to re-enrich this product" sounds convenient | Massively increases complexity: need backend API server, queue management, API key handling in frontend, error recovery. Violates the tool's architecture (batch processing + static CSVs). Processing 500 products takes hours; real-time expectation is misleading. | Run enrichment scripts separately via CLI. Reload CSVs in UI. Clear separation of concerns. |
| Database backend for scores | "Use Postgres/Supabase instead of localStorage" seems more robust | Adds deployment complexity (DB setup, migrations, hosting) for a prototype validation tool. localStorage is sufficient for a single-client demo with ~2000-3500 ratings (500 products x 4-7 tools). | localStorage with JSON export. If data loss is a concern, add a "download backup" button that exports all ratings as JSON. |
| Authentication / multi-user | "Multiple team members should be able to score" | Single client presentation tool. Multi-user adds auth, conflict resolution, score aggregation complexity. Way out of scope for a validation prototype. | If multiple reviewers needed, each runs the tool locally with their own localStorage. Merge exported CSVs manually. |
| Automated accuracy scoring (no human input) | "AI should score the other AI's output" | Circular reasoning: using an LLM to judge LLM output introduces its own bias and hallucination risk. Automated metrics (fill rate) are already captured. The VALUE of this tool is human judgment. | Automated completeness metrics + manual quality scoring. Use simple heuristic checks (GTIN checksum, description length) as supplements, not replacements. |
| Image enrichment / comparison | "Show which tool found better product images" | Out of scope per PROJECT.md. Image comparison is a different domain (visual quality assessment) that adds significant complexity without advancing the core question of data field enrichment quality. | Display existing feed images for context only. Note image enrichment as a potential future evaluation. |
| Shopify / PIM integration | "Push winning enrichment data to the store" | This is a validation tool, not a production pipeline. Integration work is premature -- the client hasn't even chosen a tool yet. Building integration before validation is backwards. | Export enriched CSV for the winning tool. Client's existing middleware can ingest it if they choose. |
| Diff between enrichment tool outputs | "Show me how Claude's description differs from Gemini's" | Text diff between two AI-generated descriptions is noisy and rarely actionable. Both descriptions are fabricated -- diffing them doesn't indicate which is better, just that they're different. | Side-by-side display (already table stakes). Client visually compares and rates. The human judgment IS the diff. |

### URL Discovery Layer (SerpAPI Google Lens)

SerpAPI Google Lens provides a visual product search that takes a product image and returns matching product page URLs from across the web. This is a **pre-enrichment step** that improves scraping accuracy:

- **Input:** Cached product images from Phase 1
- **Output:** `data/serpapi-urls.json` — a manifest mapping each SKU to discovered product page URLs with confidence scores
- **Consumption:** Scraping adapters (FireCrawl) optionally use discovered URLs instead of text-based search. All other adapters (Claude, Gemini, Perplexity) are unaffected.
- **Independence:** Completely detached from the main enrichment pipeline. Can be built and run by a separate developer. Other tools work with or without SerpAPI output.

## Feature Dependencies

```
[CSV Data Loading]
    +-- requires --> [Product Type Definitions]
    +-- enables --> [Side-by-Side Product Cards]
    |                  +-- enables --> [Visual Field Diff]
    |                  +-- enables --> [Missing Field Badges]
    |                  +-- enables --> [Enrichment Status Indicators]
    +-- enables --> [Field Completeness Metrics]
    |                  +-- enables --> [Weighted Quality Score]
    |                  +-- enables --> [Per-Field Winner Analysis]
    |                  +-- enables --> [Category Performance Heatmap]
    +-- enables --> [Filtering System]
    |                  +-- enables --> [Filter by Quality Tier]
    +-- enables --> [Product Navigation]

[Per-Product Quality Scoring]
    +-- requires --> [Side-by-Side Product Cards]
    +-- enables --> [Aggregate Summary Dashboard]
    +-- enables --> [Export Scoring Results]
    +-- enhanced-by --> [Keyboard Shortcuts for Scoring]

[Aggregate Summary Dashboard]
    +-- requires --> [Field Completeness Metrics]
    +-- requires --> [Per-Product Quality Scoring]
    +-- enhanced-by --> [Cost-per-Enrichment Comparison]
    +-- enhanced-by --> [Per-Field Winner Analysis]

[Confidence/Hallucination Flagging]
    +-- requires --> [CSV Data Loading]
    +-- independent of --> [Scoring System] (additive, not dependent)
```

### Dependency Notes

- **Side-by-Side Cards require CSV Data Loading:** The entire UI is driven by parsed CSV data. This is the foundational layer.
- **Aggregate Dashboard requires both Completeness Metrics and Scoring:** The summary view combines automated fill-rate metrics with human quality ratings. Neither alone tells the full story.
- **Filtering is a prerequisite for Quality Tier Filtering:** Basic attribute filters (brand, category) must exist before adding enrichment-specific filter dimensions.
- **Keyboard Shortcuts enhance Scoring:** Not required for scoring to work, but dramatically improves the workflow for bulk evaluation. Should be added in the same phase as scoring.
- **Hallucination Flagging is independent:** Can be added at any phase as an overlay on existing product cards. Does not block or require other features.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed for the client to evaluate enrichment tools.

- [ ] CSV data loading with typed product parsing -- foundation for everything
- [ ] Side-by-side product cards (one per tool, horizontal layout) -- core comparison view
- [ ] Visual diff highlighting (enriched vs original fields) -- shows what each tool did
- [ ] Enrichment status indicators and missing field badges -- at-a-glance assessment
- [ ] Product image display -- product context
- [ ] Product navigation with pagination -- browse all 500 products
- [ ] Filtering by brand, category, department, enrichment status -- slice the data
- [ ] Field completeness metrics per tool -- quantitative comparison
- [ ] Per-product quality scoring (1-5 stars, localStorage) -- human evaluation
- [ ] Aggregate summary dashboard with per-tool stats -- top-level comparison

### Add After Validation (v1.x)

Features to add once the core comparison flow works and the client has started evaluating.

- [ ] Weighted quality score -- add when basic scoring proves the client wants a composite metric
- [ ] Per-field winner analysis -- add when the client asks "which tool is best for X field?"
- [ ] Export scoring results as CSV -- add before final client presentation so results are portable
- [ ] Keyboard shortcuts for rapid scoring -- add when the client reports scoring is tedious
- [ ] Filter by enrichment quality tier -- add when the client wants to focus on specific quality ranges
- [ ] Cost-per-enrichment comparison -- add for the final presentation to frame ROI

### Future Consideration (v2+)

Features to defer unless the evaluation tool evolves into something longer-lived.

- [ ] Category/brand performance heatmap -- defer until enough data and scores exist to make it meaningful
- [ ] Confidence/hallucination flagging -- defer because it is HIGH complexity and the manual scoring workflow already captures quality concerns
- [ ] GTIN checksum validation -- small piece of hallucination detection that could be pulled forward if GTIN accuracy becomes a key evaluation criterion

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| CSV data loading + typed parsing | HIGH | LOW | P1 |
| Side-by-side product cards | HIGH | MEDIUM | P1 |
| Visual field diff (enriched vs original) | HIGH | MEDIUM | P1 |
| Enrichment status indicators | HIGH | LOW | P1 |
| Missing field badges | MEDIUM | LOW | P1 |
| Product image display | MEDIUM | LOW | P1 |
| Product navigation / pagination | HIGH | LOW | P1 |
| Filtering (brand, category, department) | HIGH | LOW | P1 |
| Field completeness metrics per tool | HIGH | LOW | P1 |
| Per-product quality scoring | HIGH | MEDIUM | P1 |
| Aggregate summary dashboard | HIGH | MEDIUM | P1 |
| Weighted quality score | MEDIUM | LOW | P2 |
| Per-field winner analysis | HIGH | LOW | P2 |
| Export scoring results as CSV | MEDIUM | LOW | P2 |
| Keyboard shortcuts for scoring | MEDIUM | LOW | P2 |
| Filter by quality tier | MEDIUM | LOW | P2 |
| Cost-per-enrichment comparison | MEDIUM | LOW | P2 |
| Category/brand performance heatmap | MEDIUM | MEDIUM | P3 |
| Confidence/hallucination flagging | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- core comparison and evaluation workflow
- P2: Should have, add to make the client presentation compelling
- P3: Nice to have, only if time permits or evaluation scope expands

## Competitor Feature Analysis

This is a niche internal tool, not a commercial product. "Competitors" are the alternative approaches the client might use instead of this tool.

| Feature | Spreadsheet (Manual CSV comparison) | Generic BI Tool (Tableau/Metabase) | PIM Dashboard (Akeneo/Salsify) | Our Approach |
|---------|-----------------------------------|------------------------------------|-------------------------------|--------------|
| Side-by-side per product | Painful -- multiple tabs/windows | Possible but requires custom setup | Not designed for tool-vs-tool comparison | Purpose-built: one view, all tools for one product |
| Visual field diff | No native support | No native support | Has completeness indicators but not enrichment diffs | Color-coded per-field diff with original vs enriched |
| Product images inline | No | Possible with embedding | Yes, native | Yes, from feed URLs |
| Human quality scoring | Manual column in spreadsheet | Not built-in | Has quality workflows but not A/B-style rating | Integrated 1-5 star rating per tool per product |
| Completeness metrics | Manual formulas | Requires dashboard building | Native -- this is their strength | Automated from CSV data, per-field and per-tool |
| Filtering | Basic spreadsheet filters | Strong filtering | Strong filtering | Tailored to enrichment-specific dimensions |
| Aggregate comparison | Manual pivot tables | Strong -- this is their strength | Per-product, not per-tool comparison | Purpose-built tool comparison summary |
| Export results | Already in spreadsheet | CSV/PDF export | Various export formats | CSV export of scores + metrics |

**Key advantage of a purpose-built tool:** The client's decision requires simultaneously comparing N tools on the same product with human ratings, which none of the alternatives handle natively. A spreadsheet with 500 products x 7 tools x 6 fields = 21,000 cells is unusable. A purpose-built React UI makes this tractable.

## Sources

- [Product Data Health Scorecard - WISEPIM](https://wisepim.com/ecommerce-dictionary/product-data-health-scorecard)
- [Completeness Score - Pimberly](https://pimberly.com/glossary/completeness-score/)
- [Coverage Rate vs Accuracy Rate - Derrick App](https://derrick-app.com/en/coverage-rate-vs-accuracy-rate-understanding-your-data-enrichment-metrics)
- [CatalogIQ Catalog Quality Scoring - MagnetLABS](https://magnetlabs.ai/catalogiq-catalog-quality-scoring)
- [Hallucination Detection in LLM-enriched Product Listings - Amazon Science](https://www.amazon.science/publications/hallucination-detection-in-llm-enriched-product-listings)
- [LLM Leaderboard - Artificial Analysis](https://artificialanalysis.ai/leaderboards/models)
- [Salsify vs Akeneo Comparison - PIMworks](https://www.pimworks.io/blog/salsify-vs-akeneo)
- [Data Quality Dashboards - DQOps](https://dqops.com/how-to-make-a-data-quality-dashboard/)
- [7 Best Ecommerce Product Data Enrichment Tools - Outfindo](https://www.outfindo.com/best-product-data-enrichment-tools)

---
*Feature research for: Product Data Enrichment Evaluation Tool*
*Researched: 2026-03-13*

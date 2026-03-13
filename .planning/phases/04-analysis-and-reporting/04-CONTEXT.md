# Phase 4: Analysis and Reporting - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an aggregate analysis layer on top of the existing comparison UI so the client can understand which tool wins overall, which tool wins per field, how importance weights change the outcome, how complete each tool is, and export the current analysis as CSV. This phase clarifies how reporting works inside the current frontend. It does not add new enrichment capabilities or new evaluation dimensions beyond ranking, per-field analysis, weighting, completeness, and export.

</domain>

<decisions>
## Implementation Decisions

### Winner Logic
- The analysis experience should present one blended primary ranking so the client gets a clear at-a-glance answer.
- If live confidence scores are missing for some tools, those tools stay visible but are handled in a separate clearly labeled track rather than getting a fake substitute confidence score.
- Per-field analysis should only declare a winner when the lead is meaningful. If not, the field should be shown as too close to call rather than forcing a winner.
- Analysis should support both:
  - a stable full-dataset view
  - a recalculated filtered view based on the user's active slice of products

### Dashboard Framing
- Analysis should live behind a top-level mode switch alongside the existing comparison view, not as an inline bolt-on inside the current product comparison screen.
- The first analysis view should be an executive summary: overall winner, rank cards, and key takeaways first.
- Detail should unfold in layered sections after the summary, in this order:
  - field winners
  - completeness
  - export
- The dense comparison layer should use a matrix-style table because the tool-by-field comparison is easier to scan that way than a stack of cards or tool-first sections.

### Weighting and Export
- Default weighting should start from a balanced baseline rather than assuming one field category matters more.
- Weight controls should use named presets plus manual tuning, not raw manual sliders as the only first-run experience.
- Weight changes should update the analysis live so the client immediately sees how ranking changes.
- CSV export should represent the current analysis view, including the active filters, weights, rankings, field winner snapshot, and completeness snapshot.

### Claude's Discretion
- Exact blended ranking formula, as long as it preserves the decisions above and does not invent confidence where live data lacks it.
- The threshold for "meaningful lead" in per-field winner calls.
- The exact presentation of the executive summary cards and matrix styling.
- The exact presets offered for weight tuning, as long as balanced is the default.
- CSV column order and naming, as long as the file clearly reflects the current analysis state.

</decisions>

<specifics>
## Specific Ideas

- The report should feel like an executive summary first, then an analyst surface second.
- The app should answer "who wins?" quickly, but avoid fake precision when underlying signals are weak or inconsistent.
- The filtered analysis view should let the client test narrower slices without losing the stable whole-dataset story.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/context/ProductContext.tsx`: already holds products, enrichments, available tools, selected SKU, and active filters in shared client state.
- `frontend/src/hooks/useProductData.ts` and `frontend/src/lib/csv-loader.ts`: already load all CSV data into memory on the client, which makes aggregate calculations feasible without adding a backend.
- `frontend/src/App.tsx`: already provides the app shell, header, and main content split. This is the natural place for a top-level Compare / Analysis mode switch.
- `frontend/src/components/comparison/*`: existing light-theme cards, badges, and summary sections can be reused stylistically for analysis surfaces.
- `frontend/src/components/comparison/AccuracyScore.tsx`: existing display pattern for confidence can inform analysis summary presentation.

### Established Patterns
- The frontend is currently a single comparison-oriented surface inside `BrowserRouter`, with no dedicated analysis route or multi-view navigation yet.
- Data is loaded client-side from CSV files and stored in memory, not fetched from an API or database.
- Active filters already exist for search, brand, category, and department, and they synchronize with the URL.
- The visual language is a clean, light Tailwind UI with cards, bordered sections, and responsive layout behavior.

### Integration Points
- Phase 4 should plug into the current app shell as a sibling mode to product comparison.
- Aggregate calculations should build from the same `products` and `enrichmentsByProduct` state the comparison UI already uses.
- The filtered analysis view should reuse the existing filter state instead of creating a second filtering system.
- Export should be generated from the client-side analysis state because there is no backend reporting layer.

### Data Shape Risks To Honor
- The current mock CSV pipeline writes `_accuracy_score` for all tools, including `firecrawl` and `perplexity`.
- The actual `firecrawl` and `perplexity` adapters explicitly strip `accuracy_score`, so live data may not provide confidence scores for those tools.
- Downstream planning must treat "all tools have scores" as mock behavior, not a guaranteed production contract.

</code_context>

<deferred>
## Deferred Ideas

None, discussion stayed within phase scope.

</deferred>

---

*Phase: 04-analysis-and-reporting*
*Context gathered: 2026-03-13*

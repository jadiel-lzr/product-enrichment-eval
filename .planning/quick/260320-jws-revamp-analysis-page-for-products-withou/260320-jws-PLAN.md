---
phase: quick
plan: 260320-jws
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/hooks/useNoImgAnalysis.ts
  - frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx
  - frontend/src/components/analysis/noimg/PipelineFunnel.tsx
  - frontend/src/components/analysis/noimg/UrlDiscoveryStats.tsx
  - frontend/src/components/analysis/noimg/ImageQualityStats.tsx
  - frontend/src/components/analysis/noimg/EnrichmentCoverage.tsx
  - frontend/src/components/analysis/noimg/AccuracyDistribution.tsx
  - frontend/src/App.tsx
autonomous: true
requirements: [quick-260320-jws]

must_haves:
  truths:
    - "When dataset is without-images and mode is analysis, user sees pipeline quality stats instead of tool comparison"
    - "Pipeline funnel shows conversion counts from total products through source URLs, images, unflagged images, enriched"
    - "URL discovery stats show confidence breakdown (high/medium/none) with counts"
    - "Image quality stats show imageConfidence score distribution and flagged image summary"
    - "Enrichment coverage shows overall fill rate plus per-field fill rate bars"
    - "Accuracy scores section shows average and distribution"
    - "Toggle between Compare and Analysis still works for without-images dataset"
  artifacts:
    - path: "frontend/src/hooks/useNoImgAnalysis.ts"
      provides: "Hook that computes all pipeline quality stats from ProductContext data"
    - path: "frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx"
      provides: "Top-level analysis view for without-images dataset"
    - path: "frontend/src/components/analysis/noimg/PipelineFunnel.tsx"
      provides: "Pipeline conversion funnel visualization"
    - path: "frontend/src/components/analysis/noimg/UrlDiscoveryStats.tsx"
      provides: "URL confidence breakdown card"
    - path: "frontend/src/components/analysis/noimg/ImageQualityStats.tsx"
      provides: "Image confidence distribution and flagged summary"
    - path: "frontend/src/components/analysis/noimg/EnrichmentCoverage.tsx"
      provides: "Overall and per-field fill rate bars"
    - path: "frontend/src/components/analysis/noimg/AccuracyDistribution.tsx"
      provides: "Accuracy score average and distribution"
  key_links:
    - from: "frontend/src/App.tsx"
      to: "frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx"
      via: "conditional render when datasetId is without-images and mode is analysis"
      pattern: "datasetId.*without-images.*NoImgAnalysisView"
    - from: "frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx"
      to: "frontend/src/hooks/useNoImgAnalysis.ts"
      via: "hook import providing computed stats"
      pattern: "useNoImgAnalysis"
    - from: "frontend/src/hooks/useNoImgAnalysis.ts"
      to: "frontend/src/context/ProductContext.tsx"
      via: "useProducts hook for products and enrichmentsByProduct"
      pattern: "useProducts|useProductContext"
---

<objective>
Build a pipeline quality Analysis view for the without-images dataset that replaces the tool-comparison Analysis (which is meaningless for a single-tool dataset). Instead of rankings and field winners across tools, show pipeline health: funnel conversion, URL discovery rates, image quality distribution, enrichment coverage, and accuracy scores.

Purpose: The without-images dataset only has one tool (noimg-claude), making tool-comparison analysis nonsensical. The client needs to see how well the enrichment pipeline performed across its stages.
Output: NoImgAnalysisView with 5 stat sections, integrated into App.tsx via dataset-aware conditional rendering.
</objective>

<execution_context>
@/Users/jadieldossantos/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jadieldossantos/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/App.tsx
@frontend/src/context/ProductContext.tsx
@frontend/src/types/enrichment.ts
@frontend/src/types/dataset.ts
@frontend/src/components/analysis/AnalysisView.tsx
@frontend/src/components/analysis/CompletenessSection.tsx
@frontend/src/components/analysis/ExecutiveSummary.tsx
@frontend/src/hooks/useAnalysisState.ts

<interfaces>
<!-- Key types the executor needs. Extracted from codebase. -->

From frontend/src/types/enrichment.ts:
```typescript
export interface ToolEnrichment {
  readonly sku: string
  readonly tool: ToolName
  readonly status: 'success' | 'partial' | 'failed'
  readonly error?: string
  readonly accuracyScore?: number
  readonly scoreTrack: ScoreTrack
  readonly fieldsEnriched: number
  readonly totalFields: number
  readonly enrichedValues: Readonly<Record<string, string>>
  readonly originalValues: Readonly<Record<string, string>>
  readonly imageLinks?: readonly string[]
  readonly imageFlags?: readonly ImageFlag[]
  readonly sourceUrl?: string
  readonly confidenceScore?: string       // 'high' | 'medium' | 'none'
  readonly matchReason?: string
  readonly imageConfidence?: number       // 0-10
}

export interface ImageFlag {
  readonly url: string
  readonly reason: string
}

export const CORE_ENRICHMENT_FIELDS = [
  'title', 'description_eng', 'season', 'year', 'collection', 'gtin',
  'dimensions', 'made_in', 'materials', 'weight', 'color', 'additional_info',
] as const

export type CoreEnrichmentField = (typeof CORE_ENRICHMENT_FIELDS)[number]

export const FIELD_LABELS: Record<CoreEnrichmentField, string>
```

From frontend/src/context/ProductContext.tsx:
```typescript
interface ProductContextValue {
  readonly datasetId: DatasetId
  readonly products: Product[]
  readonly enrichmentsByProduct: Map<string, ToolEnrichment[]>
  readonly filteredProducts: Product[]
  readonly availableTools: ToolName[]
  // ... filters, loading, error
}
export function useProducts(): ProductContextValue
```

From frontend/src/App.tsx (current AppContent rendering logic):
```typescript
function AppContent() {
  const { loading, error, filteredProducts, availableTools } = useProducts()
  const isSingleTool = availableTools.length <= 1
  const [mode, setMode] = useState<'compare' | 'analysis'>('compare')
  // ...
  // Currently: isSingleTool hides the AnalysisModeToggle
  // Currently: mode === 'compare' || isSingleTool → ComparisonView, else → AnalysisView
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useNoImgAnalysis hook and all stat computation logic</name>
  <files>frontend/src/hooks/useNoImgAnalysis.ts</files>
  <action>
Create a hook `useNoImgAnalysis` that reads from `useProductContext()` and computes all five stat sections. The hook returns a single immutable stats object.

**Return type (define in the same file):**

```typescript
interface FunnelStep {
  readonly label: string
  readonly count: number
  readonly percent: number  // 0-100, relative to totalProducts
}

interface ConfidenceBreakdown {
  readonly level: 'high' | 'medium' | 'none'
  readonly count: number
  readonly percent: number
}

interface FieldFillRate {
  readonly field: CoreEnrichmentField
  readonly label: string
  readonly filled: number
  readonly total: number
  readonly rate: number  // 0-1
}

interface NoImgAnalysisStats {
  readonly totalProducts: number
  readonly filteredProducts: number
  readonly filterSummary: string

  // Pipeline funnel
  readonly funnel: readonly FunnelStep[]

  // URL discovery
  readonly urlDiscovery: {
    readonly withSourceUrl: number
    readonly withoutSourceUrl: number
    readonly confidenceBreakdown: readonly ConfidenceBreakdown[]
  }

  // Image quality
  readonly imageQuality: {
    readonly withImages: number
    readonly withoutImages: number
    readonly withFlaggedImages: number
    readonly allFlagged: number  // products where ALL images are flagged
    readonly scoreDistribution: readonly { readonly bucket: string; readonly count: number }[]
    readonly averageConfidence: number | null
  }

  // Enrichment coverage
  readonly enrichmentCoverage: {
    readonly successCount: number
    readonly partialCount: number
    readonly failedCount: number
    readonly notEnrichedCount: number
    readonly overallFillRate: number  // 0-1
    readonly fieldRates: readonly FieldFillRate[]
  }

  // Accuracy
  readonly accuracy: {
    readonly average: number | null
    readonly distribution: readonly { readonly bucket: string; readonly count: number }[]
    readonly count: number  // how many have accuracy scores
  }
}
```

**Computation logic (all derived from `products`, `filteredProducts`, `enrichmentsByProduct`):**

Use `filteredProducts` as the basis for all stats (respects sidebar filters). For each filtered product, look up its enrichments via `enrichmentsByProduct.get(product.sku)` and take the first entry (since without-images only has one tool).

1. **Funnel steps:** Compute in order:
   - "Total Products" = filteredProducts.length
   - "Source URL Found" = count where enrichment has sourceUrl truthy
   - "Has Images" = count where enrichment has imageLinks with length > 0
   - "Unflagged Images" = count where enrichment has at least one imageLink that is NOT in imageFlags
   - "Enriched" = count where enrichment status is 'success' or 'partial'
   - percent = (count / totalProducts) * 100

2. **URL discovery:** Group by confidenceScore field ('high', 'medium', everything else = 'none'). Count products with/without sourceUrl.

3. **Image quality:**
   - scoreDistribution: bucket imageConfidence into ranges: "0-2", "3-4", "5-6", "7-8", "9-10", count per bucket
   - averageConfidence: mean of all non-null imageConfidence values
   - withFlaggedImages: count where imageFlags has length > 0
   - allFlagged: count where imageFlags length equals imageLinks length (all images flagged)

4. **Enrichment coverage:**
   - success/partial/failed counts from enrichment status
   - notEnrichedCount = filteredProducts with no enrichment entry
   - overallFillRate: sum of fieldsEnriched / sum of totalFields across all enrichments
   - fieldRates: for each of CORE_ENRICHMENT_FIELDS, count how many enrichments have a non-empty enrichedValues[field], compute filled/total/rate

5. **Accuracy:**
   - Collect all accuracyScore values (non-null)
   - average = mean
   - distribution: buckets "1-2", "3-4", "5-6", "7-8", "9-10"

Wrap computation in `useMemo` keyed on `[filteredProducts, enrichmentsByProduct, filters]`.

Build `filterSummary` using same pattern as `useAnalysisState.ts` (format active filters as "Label: value | ..." or "All products").

Export the `NoImgAnalysisStats` type and the `useNoImgAnalysis` hook.
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Hook compiles with no type errors, exports NoImgAnalysisStats type and useNoImgAnalysis function. All 5 stat sections computed from ProductContext data.</done>
</task>

<task type="auto">
  <name>Task 2: Create NoImgAnalysisView and all 5 section components</name>
  <files>
    frontend/src/components/analysis/noimg/NoImgAnalysisView.tsx
    frontend/src/components/analysis/noimg/PipelineFunnel.tsx
    frontend/src/components/analysis/noimg/UrlDiscoveryStats.tsx
    frontend/src/components/analysis/noimg/ImageQualityStats.tsx
    frontend/src/components/analysis/noimg/EnrichmentCoverage.tsx
    frontend/src/components/analysis/noimg/AccuracyDistribution.tsx
  </files>
  <action>
Create 6 new files in `frontend/src/components/analysis/noimg/`. Match the existing dashboard style: Tailwind, rounded-2xl/3xl cards, gray-50 backgrounds, border-gray-200 borders, shadow-sm, text sizing patterns from ExecutiveSummary.tsx and CompletenessSection.tsx.

**NoImgAnalysisView.tsx** — Top-level orchestrator:
- Import and call `useNoImgAnalysis()`
- If no enrichment data, render `AnalysisEmptyState` (import from existing `../AnalysisEmptyState`)
- Dark hero banner at top (same pattern as AnalysisView.tsx — rounded-3xl bg-gray-900 text-white card):
  - Title: "Pipeline Quality Analysis"
  - Subtitle: "Evaluating enrichment pipeline health across {stats.filteredProducts} of {stats.totalProducts} products"
  - Active filters badge (same as AnalysisView)
- Below: render PipelineFunnel, UrlDiscoveryStats, ImageQualityStats, EnrichmentCoverage, AccuracyDistribution in a `space-y-5 p-4 md:p-6` container
- Wrap all in `<div className="h-full overflow-y-auto">`

**PipelineFunnel.tsx** — Pipeline conversion funnel:
- Props: `{ readonly steps: NoImgAnalysisStats['funnel'] }`
- White card (rounded-3xl border border-gray-200 bg-white p-5 shadow-sm)
- Section title: "Pipeline Funnel" with subtitle "Conversion at each pipeline step"
- Render each step as a horizontal bar. Use a descending bar chart pattern:
  - Each step is a row with: label, count, percentage, and a visual bar
  - Bar width = `${step.percent}%` with bg-gray-900 (first step) and progressively lighter shades (bg-gray-700, bg-gray-500, bg-gray-400, bg-emerald-600 for final "Enriched")
  - Show the count on the left, percent on the right
  - Steps are vertically stacked with connectors (a simple downward arrow or chevron between rows)

**UrlDiscoveryStats.tsx** — URL discovery confidence:
- Props: `{ readonly stats: NoImgAnalysisStats['urlDiscovery']; readonly totalProducts: number }`
- White card with section title "URL Discovery"
- Top row: two stat boxes side by side:
  - "Source URL Found" — stats.withSourceUrl count + percent of total
  - "No Source URL" — stats.withoutSourceUrl count + percent
- Below: confidence breakdown as 3 horizontal bars (high=emerald, medium=amber, none=gray) with counts and percentages
- Use the same bar pattern as CompletenessSection.tsx (h-2 rounded-full bg-gray-200 with colored inner div)

**ImageQualityStats.tsx** — Image confidence distribution:
- Props: `{ readonly stats: NoImgAnalysisStats['imageQuality']; readonly totalProducts: number }`
- White card with section title "Image Quality"
- Top summary row: 4 stat boxes in a grid:
  - "Has Images" (count/percent)
  - "No Images" (count/percent)
  - "Has Flagged" (count/percent, amber if > 0)
  - "All Flagged" (count/percent, red if > 0)
- Score distribution: horizontal bar for each bucket ("0-2", "3-4", etc.) with count
  - Color code: 0-2 = red-500, 3-4 = amber-500, 5-6 = yellow-500, 7-8 = emerald-500, 9-10 = emerald-700
- Average confidence shown as a large number if available, or "N/A"

**EnrichmentCoverage.tsx** — Fill rates:
- Props: `{ readonly stats: NoImgAnalysisStats['enrichmentCoverage']; readonly totalProducts: number }`
- White card with section title "Enrichment Coverage"
- Top row: status distribution (4 stat boxes): Success, Partial, Failed, Not Enriched
  - Success = emerald, Partial = amber, Failed = red, Not Enriched = gray
- Overall fill rate as a large percentage with a full-width progress bar
- Per-field fill rates: reuse the same bar chart pattern as CompletenessSection.tsx
  - Each field: label on left, percent on right, h-2 bar below
  - Use FIELD_LABELS for display names
  - Sort by fill rate descending so the strongest fields appear first

**AccuracyDistribution.tsx** — Accuracy scores:
- Props: `{ readonly stats: NoImgAnalysisStats['accuracy'] }`
- White card with section title "Accuracy Scores"
- Large average score displayed prominently (e.g., "7.2 / 10") with "from N products" subtitle
- Distribution as horizontal bars per bucket, same pattern as ImageQualityStats
  - Color: 1-2 = red, 3-4 = amber, 5-6 = yellow, 7-8 = emerald, 9-10 = emerald dark
- If no accuracy data (count = 0), show a muted "No accuracy scores available" message

All components: use `readonly` props, pure functional components, no internal state. Do NOT import from or modify any existing analysis components.
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>All 6 component files compile, NoImgAnalysisView renders the 5 sections using stats from useNoImgAnalysis hook. Visual style matches existing dashboard cards.</done>
</task>

<task type="auto">
  <name>Task 3: Wire NoImgAnalysisView into App.tsx with dataset-aware toggle</name>
  <files>frontend/src/App.tsx</files>
  <action>
Modify `AppContent` in `App.tsx` to:

1. Import `useProducts` already provides `datasetId`. Also import `NoImgAnalysisView` from `@/components/analysis/noimg/NoImgAnalysisView`.

2. **Change the toggle visibility condition:**
   Currently: `!loading && !error && !isSingleTool` shows the toggle.
   New: `!loading && !error && (availableTools.length > 1 || datasetId === 'without-images')` shows the toggle.
   This ensures the toggle appears for without-images even though it only has one tool.

3. **Change the main content conditional:**
   Currently:
   ```
   {mode === 'compare' || isSingleTool ? <ComparisonView /> : <AnalysisView />}
   ```
   New logic:
   ```
   {mode === 'compare'
     ? <ComparisonView />
     : datasetId === 'without-images'
       ? <NoImgAnalysisView />
       : <AnalysisView />}
   ```
   When mode is 'analysis': if without-images dataset, render NoImgAnalysisView; otherwise render AnalysisView.
   When mode is 'compare': always render ComparisonView (regardless of dataset).

4. Extract `datasetId` from `useProducts()` in the destructuring at the top of AppContent.

Do NOT change any other part of App.tsx (sidebar, header structure, dataset tabs, skeleton states).
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit 2>&1 | head -30 && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Toggle shows for without-images dataset. Clicking "Analysis" renders NoImgAnalysisView with pipeline quality stats. Clicking "Compare" still shows ComparisonView. Build succeeds with no errors.</done>
</task>

</tasks>

<verification>
1. `cd frontend && npx tsc --noEmit` — no type errors
2. `cd frontend && npm run build` — production build succeeds
3. Manual: navigate to without-images dataset, toggle to Analysis mode, verify all 5 sections render
4. Manual: navigate to with-images dataset, verify existing Analysis view still works unchanged
5. Manual: apply sidebar filters on without-images, verify stats update
</verification>

<success_criteria>
- Without-images dataset shows Analysis toggle in header
- Analysis mode renders pipeline quality view with: funnel, URL discovery, image quality, enrichment coverage, accuracy sections
- All stat counts and percentages derive from actual enrichment data via ProductContext
- With-images dataset Analysis mode still shows the original tool-comparison view (completely unchanged)
- Sidebar filters affect the no-image analysis stats
- Frontend builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/260320-jws-revamp-analysis-page-for-products-withou/260320-jws-SUMMARY.md`
</output>

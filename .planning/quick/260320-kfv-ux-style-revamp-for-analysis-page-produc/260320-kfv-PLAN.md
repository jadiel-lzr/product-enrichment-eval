---
phase: quick
plan: 260320-kfv
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/analysis/AnalysisView.tsx
  - frontend/src/components/analysis/ExecutiveSummary.tsx
  - frontend/src/components/analysis/WeightControls.tsx
  - frontend/src/components/analysis/FieldWinnerMatrix.tsx
  - frontend/src/components/analysis/CompletenessSection.tsx
autonomous: true
requirements: [UX-COPY]
must_haves:
  truths:
    - "Analysis page header says 'Enrichment Tool Comparison' not 'Aggregate reporting...'"
    - "Score labels read 'Overall', 'Accuracy', and 'Completeness' instead of 'Blended', 'Quality', 'Completeness'"
    - "Track badges read 'Has Accuracy Scores' and 'No Accuracy Scores'"
    - "Weight controls show presets by default with manual sliders hidden behind an Advanced toggle"
    - "Field winner section titled 'Field-by-Field Comparison' with clear subtitle"
    - "No verbose/technical explanations remain in any section"
  artifacts:
    - path: "frontend/src/components/analysis/AnalysisView.tsx"
      provides: "Simplified header copy"
    - path: "frontend/src/components/analysis/ExecutiveSummary.tsx"
      provides: "Cleaner labels and descriptions"
    - path: "frontend/src/components/analysis/WeightControls.tsx"
      provides: "Collapsible advanced weight inputs"
    - path: "frontend/src/components/analysis/FieldWinnerMatrix.tsx"
      provides: "Simplified section heading"
    - path: "frontend/src/components/analysis/CompletenessSection.tsx"
      provides: "Consistent copy style"
  key_links: []
---

<objective>
Simplify all user-facing copy and labels on the with-images Analysis page to be client-friendly. Hide advanced weight controls behind a toggle. No structural, hook, or logic changes.

Purpose: The current copy uses technical jargon ("confidence-backed", "blended", "no-confidence track") that is confusing for a client presentation. This pass makes everything scannable and clear.
Output: 5 modified component files with cleaner copy and a collapsible Advanced section in WeightControls.
</objective>

<execution_context>
@/Users/jadieldossantos/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jadieldossantos/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/components/analysis/AnalysisView.tsx
@frontend/src/components/analysis/ExecutiveSummary.tsx
@frontend/src/components/analysis/WeightControls.tsx
@frontend/src/components/analysis/FieldWinnerMatrix.tsx
@frontend/src/components/analysis/CompletenessSection.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update copy in AnalysisView, ExecutiveSummary, FieldWinnerMatrix, CompletenessSection</name>
  <files>
    frontend/src/components/analysis/AnalysisView.tsx,
    frontend/src/components/analysis/ExecutiveSummary.tsx,
    frontend/src/components/analysis/FieldWinnerMatrix.tsx,
    frontend/src/components/analysis/CompletenessSection.tsx
  </files>
  <action>
    **AnalysisView.tsx** (header section only):
    - Change h1 from "Aggregate reporting across the shared product slice" to "Enrichment Tool Comparison"
    - Change subtitle from "Shared sidebar filters currently cover {scope.filteredProducts} of {scope.totalProducts} products. The full-dataset view remains visible so filtered experiments do not erase the stable benchmark." to "Comparing {scope.filteredProducts} of {scope.totalProducts} products"
    - Keep the "Active filters" badge untouched

    **ExecutiveSummary.tsx**:
    - In `TrackBadge`: change "Confidence-backed" to "Has Accuracy Scores", change "No-confidence track" to "No Accuracy Scores"
    - In the score grid inside `SummaryColumn`: change label "Blended" to "Overall", change label "Quality" to "Accuracy" (keep "Completeness" as-is)
    - Change the per-row description: for confidence track, change `Uses real confidence scores from ${row.confidenceMetrics?.sampleSize ?? 0} rows.` to `Based on ${row.confidenceMetrics?.sampleSize ?? 0} products with accuracy scores`
    - For no-confidence track, change "Visible in a separate no-confidence track because source data lacks usable confidence scores." to "This tool did not provide accuracy scores"
    - In the main header: keep "Which tool wins overall" (it is clear enough) or simplify to "Which Tool Wins Overall" (capitalize)
    - Change the subtitle "The full-dataset ranking stays stable for the big-picture story, while the filtered slice shows how the current product subset shifts the outcome." to "Full dataset shows the overall picture. Filtered slice reflects your current selection."
    - In the takeaways section: change h2 "Read this before the detail tables" to "Key Insights"
    - Remove the "Missing-confidence tools stay visible, never backfilled" span entirely (set to null or remove the element)

    **FieldWinnerMatrix.tsx**:
    - Change h2 "Matrix view" to "Field-by-Field Comparison"
    - Remove the paragraph "This table favors scanability over decoration. Fields can stay unresolved when the lead is not meaningful."
    - Add a new paragraph in its place: "Which tool performed best for each enrichment field"

    **CompletenessSection.tsx**:
    - No major changes. Ensure "Coverage by tool and field" stays. This file is already clean.
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>All four files have updated copy. No jargon terms remain ("blended", "confidence-backed", "no-confidence track"). TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Add collapsible Advanced toggle to WeightControls</name>
  <files>frontend/src/components/analysis/WeightControls.tsx</files>
  <action>
    - Change h2 "Tune what matters" to "Field Weights"
    - Change description from "Start from a named preset, then override individual fields. Rankings recompute live from the shared in-memory dataset." to "Choose a preset to prioritize different aspects. Rankings update instantly."
    - Add a `useState<boolean>(false)` called `showAdvanced` (import useState from React)
    - Keep the preset buttons grid always visible (no change)
    - Wrap the 12 manual weight input grid (the `div.mt-5.grid` containing the CORE_ENRICHMENT_FIELDS map) in a collapsible section:
      - Add a button ABOVE the grid: text "Show advanced" when collapsed, "Hide advanced" when expanded
      - Style the toggle button: `text-sm font-medium text-gray-500 hover:text-gray-700 transition` with a small chevron indicator (use a simple unicode arrow like ">" rotated, or the text alone is fine)
      - Conditionally render the grid only when `showAdvanced` is true
    - Do NOT change any props, callbacks, or the weight input logic itself
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Weight controls show presets by default. Manual weight inputs are hidden behind "Show advanced" / "Hide advanced" toggle. Toggle works correctly. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npx tsc --noEmit && npm run build
</verification>

<success_criteria>
- All technical jargon replaced with client-friendly copy across 5 files
- Weight manual inputs hidden behind collapsible Advanced toggle
- Preset buttons remain always visible
- No files outside the 5 listed were modified
- Frontend builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/260320-kfv-ux-style-revamp-for-analysis-page-produc/260320-kfv-SUMMARY.md`
</output>

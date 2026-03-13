import { AnalysisEmptyState } from './AnalysisEmptyState'
import { CompletenessSection } from './CompletenessSection'
import { ExecutiveSummary } from './ExecutiveSummary'
import { ExportButton } from './ExportButton'
import { FieldWinnerMatrix } from './FieldWinnerMatrix'
import { WeightControls } from './WeightControls'
import { useAnalysisState } from '@/hooks/useAnalysisState'

export function AnalysisView() {
  const {
    summary,
    weightConfig,
    presets,
    selectedPresetId,
    manualWeights,
    hasAnyEnrichmentData,
    hasFilteredProducts,
    scope,
    exportPayload,
    setSelectedPreset,
    setManualWeight,
    clearManualWeight,
  } = useAnalysisState()

  if (!hasAnyEnrichmentData) {
    return <AnalysisEmptyState variant="no-enrichment" />
  }

  if (!hasFilteredProducts) {
    return <AnalysisEmptyState variant="no-products" />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 md:p-6">
        <section className="rounded-3xl border border-gray-200 bg-gray-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
                Analysis Mode
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Aggregate reporting across the shared product slice
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
                Shared sidebar filters currently cover {scope.filteredProducts} of {scope.totalProducts} products. The full-dataset view remains visible so filtered experiments do not erase the stable benchmark.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-200">
              <div className="font-medium text-white">Active filters</div>
              <div className="mt-1">{scope.filterSummary}</div>
            </div>
          </div>
        </section>

        <ExecutiveSummary
          fullDataset={summary.fullDataset}
          filteredSlice={summary.filteredSlice}
          takeaways={summary.takeaways}
        />

        <WeightControls
          presets={presets}
          selectedPresetId={selectedPresetId}
          effectiveWeights={weightConfig.effectiveWeights}
          manualWeights={manualWeights}
          onPresetChange={setSelectedPreset}
          onManualWeightChange={setManualWeight}
          onManualWeightClear={clearManualWeight}
        />

        <FieldWinnerMatrix rows={summary.fieldWinners} />
        <CompletenessSection rows={summary.completeness} />
        <ExportButton payload={exportPayload} />
      </div>
    </div>
  )
}

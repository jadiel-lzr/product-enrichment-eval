import { useMemo, useState } from 'react'
import { useProductContext } from '@/context/ProductContext'
import {
  buildAnalysisSummary,
  buildAnalysisExportRows,
} from '@/lib/analysis/scoring'
import {
  ANALYSIS_WEIGHT_PRESETS,
  DEFAULT_WEIGHT_PRESET_ID,
  buildWeightConfig,
} from '@/lib/analysis/weights'
import type {
  AnalysisExportRow,
  AnalysisSummary,
  AnalysisWeightConfig,
  WeightPreset,
} from '@/lib/analysis/types'
import {
  CORE_ENRICHMENT_FIELDS,
  FIELD_LABELS,
  TOOL_DISPLAY_NAMES,
  type CoreEnrichmentField,
} from '@/types/enrichment'

export interface AnalysisScopeMetadata {
  readonly totalProducts: number
  readonly filteredProducts: number
  readonly filters: Readonly<Record<string, string>>
  readonly filterSummary: string
}

export interface AnalysisExportPayload {
  readonly metadata: AnalysisScopeMetadata
  readonly rows: readonly AnalysisExportRow[]
}

export interface UseAnalysisStateResult {
  readonly summary: AnalysisSummary
  readonly weightConfig: AnalysisWeightConfig
  readonly presets: readonly WeightPreset[]
  readonly selectedPresetId: AnalysisWeightConfig['presetId']
  readonly manualWeights: Partial<Record<CoreEnrichmentField, number>>
  readonly scope: AnalysisScopeMetadata
  readonly hasAnyEnrichmentData: boolean
  readonly hasFilteredProducts: boolean
  readonly exportPayload: AnalysisExportPayload
  readonly setSelectedPreset: (presetId: AnalysisWeightConfig['presetId']) => void
  readonly setManualWeight: (field: CoreEnrichmentField, value: number) => void
  readonly clearManualWeight: (field: CoreEnrichmentField) => void
}

function formatFilterSummary(filters: Record<string, string>): string {
  const active = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (active.length === 0) {
    return 'All products'
  }

  return active
    .map(([key, value]) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1)
      return `${label}: ${value}`
    })
    .join(' | ')
}

function formatManualWeightValue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return ''
  }

  return value.toString()
}

export function useAnalysisState(): UseAnalysisStateResult {
  const { products, filteredProducts, enrichmentsByProduct, filters } = useProductContext()
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_WEIGHT_PRESET_ID)
  const [manualWeights, setManualWeights] = useState<
    Partial<Record<CoreEnrichmentField, number>>
  >({})

  const weightConfig = useMemo(
    () => buildWeightConfig(selectedPresetId, manualWeights),
    [manualWeights, selectedPresetId],
  )

  const summary = useMemo(
    () =>
      buildAnalysisSummary({
        products,
        filteredProducts,
        enrichmentsByProduct,
        weights: weightConfig,
        meaningfulLeadThreshold: 0.05,
      }),
    [enrichmentsByProduct, filteredProducts, products, weightConfig],
  )

  const scope = useMemo<AnalysisScopeMetadata>(
    () => ({
      totalProducts: products.length,
      filteredProducts: filteredProducts.length,
      filters: {
        search: filters.search,
        brand: filters.brand,
        category: filters.category,
        department: filters.department,
        enrichedBy: filters.enrichedBy,
      },
      filterSummary: formatFilterSummary({
        search: filters.search,
        brand: filters.brand,
        category: filters.category,
        department: filters.department,
        enrichedBy: filters.enrichedBy,
      }),
    }),
    [filteredProducts.length, filters, products.length],
  )

  const exportPayload = useMemo<AnalysisExportPayload>(() => {
    const baseRows = buildAnalysisExportRows(summary)
    const metadataRows: AnalysisExportRow[] = [
      {
        scope: 'meta',
        section: 'weights',
        metric: 'filterSummary',
        value: scope.filterSummary,
      },
      {
        scope: 'meta',
        section: 'weights',
        metric: 'totalProducts',
        value: scope.totalProducts,
      },
      {
        scope: 'meta',
        section: 'weights',
        metric: 'filteredProducts',
        value: scope.filteredProducts,
      },
    ]

    for (const [key, value] of Object.entries(scope.filters)) {
      metadataRows.push({
        scope: 'meta',
        section: 'weights',
        metric: `filter.${key}`,
        value: value || '(all)',
      })
    }

    for (const field of CORE_ENRICHMENT_FIELDS) {
      metadataRows.push({
        scope: 'weights',
        section: 'weights',
        field,
        metric: 'fieldLabel',
        value: FIELD_LABELS[field],
      })
      metadataRows.push({
        scope: 'weights',
        section: 'weights',
        field,
        metric: 'manualOverride',
        value: formatManualWeightValue(manualWeights[field]),
      })
    }

    return {
      metadata: scope,
      rows: [...metadataRows, ...baseRows],
    }
  }, [manualWeights, scope, summary])

  const hasAnyEnrichmentData = useMemo(() => {
    for (const rows of enrichmentsByProduct.values()) {
      if (rows.length > 0) {
        return true
      }
    }
    return false
  }, [enrichmentsByProduct])

  const setManualWeight = (field: CoreEnrichmentField, value: number) => {
    setManualWeights((current) => {
      if (!Number.isFinite(value) || value < 0) {
        const next = { ...current }
        delete next[field]
        return next
      }

      return { ...current, [field]: value }
    })
  }

  const clearManualWeight = (field: CoreEnrichmentField) => {
    setManualWeights((current) => {
      if (!(field in current)) {
        return current
      }
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  return {
    summary,
    weightConfig,
    presets: ANALYSIS_WEIGHT_PRESETS,
    selectedPresetId,
    manualWeights,
    scope,
    hasAnyEnrichmentData,
    hasFilteredProducts: filteredProducts.length > 0,
    exportPayload,
    setSelectedPreset: setSelectedPresetId,
    setManualWeight,
    clearManualWeight,
  }
}

export function formatToolLabel(tool: string): string {
  return TOOL_DISPLAY_NAMES[tool as keyof typeof TOOL_DISPLAY_NAMES] ?? tool
}

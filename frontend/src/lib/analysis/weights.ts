import { CORE_ENRICHMENT_FIELDS, type CoreEnrichmentField } from '@/types/enrichment'
import type {
  AnalysisWeightConfig,
  FieldWeightMap,
  WeightPreset,
  WeightPresetId,
} from '@/lib/analysis/types'

function createWeights(
  values: Readonly<Record<CoreEnrichmentField, number>>,
): FieldWeightMap {
  return values
}

function mergeWeights(
  base: FieldWeightMap,
  overrides: Partial<Record<CoreEnrichmentField, number>>,
): FieldWeightMap {
  const merged = { ...base }
  for (const field of CORE_ENRICHMENT_FIELDS) {
    const override = overrides[field]
    if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
      merged[field] = override
    }
  }
  return merged
}

export const ANALYSIS_WEIGHT_PRESETS: readonly WeightPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Even weighting across the core enrichment fields.',
    weights: createWeights({
      description_eng: 1,
      season: 1,
      year: 1,
      collection: 1,
      gtin: 1,
      dimensions: 1,
      made_in: 1,
      materials: 1,
      weight: 1,
      color: 1,
      additional_info: 1,
    }),
  },
  {
    id: 'accuracy-first',
    label: 'Accuracy First',
    description: 'Prioritize narrative and compliance-sensitive fields.',
    weights: createWeights({
      description_eng: 1.4,
      season: 0.8,
      year: 0.8,
      collection: 0.9,
      gtin: 1.3,
      dimensions: 1,
      made_in: 1.1,
      materials: 1.2,
      weight: 0.9,
      color: 0.9,
      additional_info: 0.7,
    }),
  },
  {
    id: 'completeness-first',
    label: 'Completeness First',
    description: 'Emphasize broad field coverage for catalog readiness.',
    weights: createWeights({
      description_eng: 1,
      season: 1.2,
      year: 1.2,
      collection: 1.2,
      gtin: 0.9,
      dimensions: 1.1,
      made_in: 1.1,
      materials: 1.1,
      weight: 1.2,
      color: 1.1,
      additional_info: 1.0,
    }),
  },
]

export const DEFAULT_WEIGHT_PRESET_ID: WeightPresetId = 'balanced'

export function getWeightPreset(presetId: WeightPresetId): WeightPreset {
  return (
    ANALYSIS_WEIGHT_PRESETS.find((preset) => preset.id === presetId) ??
    ANALYSIS_WEIGHT_PRESETS[0]
  )
}

export function buildWeightConfig(
  presetId: WeightPresetId = DEFAULT_WEIGHT_PRESET_ID,
  manualOverrides: Partial<Record<CoreEnrichmentField, number>> = {},
): AnalysisWeightConfig {
  const preset = getWeightPreset(presetId)

  return {
    presetId: preset.id,
    presetWeights: preset.weights,
    manualOverrides,
    effectiveWeights: mergeWeights(preset.weights, manualOverrides),
  }
}

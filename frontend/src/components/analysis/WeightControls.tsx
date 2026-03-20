import { useState } from 'react'
import { CORE_ENRICHMENT_FIELDS, FIELD_LABELS, type CoreEnrichmentField } from '@/types/enrichment'
import type { WeightPreset } from '@/lib/analysis/types'

interface WeightControlsProps {
  readonly presets: readonly WeightPreset[]
  readonly selectedPresetId: WeightPreset['id']
  readonly effectiveWeights: Readonly<Record<CoreEnrichmentField, number>>
  readonly manualWeights: Partial<Record<CoreEnrichmentField, number>>
  readonly onPresetChange: (presetId: WeightPreset['id']) => void
  readonly onManualWeightChange: (field: CoreEnrichmentField, value: number) => void
  readonly onManualWeightClear: (field: CoreEnrichmentField) => void
}

function formatWeight(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

export function WeightControls({
  presets,
  selectedPresetId,
  effectiveWeights,
  manualWeights,
  onPresetChange,
  onManualWeightChange,
  onManualWeightClear,
}: WeightControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Weighting
          </p>
          <h2 className="text-xl font-semibold text-gray-900">Field Weights</h2>
          <p className="text-sm leading-6 text-gray-500">
            Choose a preset to prioritize different aspects. Rankings update instantly.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {presets.map((preset) => {
            const active = preset.id === selectedPresetId

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetChange(preset.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white'
                }`}
              >
                <div className="text-sm font-semibold">{preset.label}</div>
                <div className={`mt-1 text-xs ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                  {preset.description}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="text-sm font-medium text-gray-500 transition hover:text-gray-700"
        >
          <span
            className="mr-1.5 inline-block transition-transform"
            style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            {'\u25B8'}
          </span>
          {showAdvanced ? 'Hide advanced' : 'Show advanced'}
        </button>

        {showAdvanced ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CORE_ENRICHMENT_FIELDS.map((field) => {
              const manualValue = manualWeights[field]

              return (
                <label
                  key={field}
                  className="rounded-2xl border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{FIELD_LABELS[field]}</span>
                    <span className="text-xs text-gray-500">
                      Live weight: {formatWeight(effectiveWeights[field])}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={manualValue ?? ''}
                      onChange={(event) =>
                        onManualWeightChange(field, Number(event.target.value))
                      }
                      placeholder={formatWeight(effectiveWeights[field])}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => onManualWeightClear(field)}
                      className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
                    >
                      Reset
                    </button>
                  </div>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}

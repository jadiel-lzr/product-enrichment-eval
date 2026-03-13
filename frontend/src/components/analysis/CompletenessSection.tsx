import { FIELD_LABELS, TOOL_DISPLAY_NAMES } from '@/types/enrichment'
import type { CompletenessMatrixRow } from '@/lib/analysis/types'

interface CompletenessSectionProps {
  readonly rows: readonly CompletenessMatrixRow[]
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function buildCoverageGapSummary(rows: readonly CompletenessMatrixRow[]): string {
  const lowestRows = [...rows].sort((a, b) => a.overallFillRate - b.overallFillRate)
  const weakest = lowestRows[0]

  if (!weakest) {
    return 'No completeness data is available for the current slice.'
  }

  const weakestField = [...weakest.fields].sort((a, b) => a.fillRate - b.fillRate)[0]

  if (!weakestField) {
    return `${TOOL_DISPLAY_NAMES[weakest.tool]} has the thinnest overall coverage in the current slice.`
  }

  return `${TOOL_DISPLAY_NAMES[weakest.tool]} has the biggest coverage gap, especially on ${FIELD_LABELS[weakestField.field]}.`
}

export function CompletenessSection({ rows }: CompletenessSectionProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Completeness
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">Coverage by tool and field</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-gray-500">
          {buildCoverageGapSummary(rows)}
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {rows.map((row) => (
          <article
            key={row.tool}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {TOOL_DISPLAY_NAMES[row.tool]}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Overall fill rate: {formatPercent(row.overallFillRate)}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
                {row.overallFilledCount}/{row.overallTotalCount} filled cells
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {row.fields.map((field) => (
                <div key={field.field}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-700">{FIELD_LABELS[field.field]}</span>
                    <span className="font-medium text-gray-900">
                      {formatPercent(field.fillRate)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gray-900"
                      style={{ width: `${Math.round(field.fillRate * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

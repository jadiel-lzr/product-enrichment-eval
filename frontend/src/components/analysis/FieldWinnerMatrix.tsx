import { FIELD_LABELS, TOOL_DISPLAY_NAMES, TOOL_NAMES } from '@/types/enrichment'
import type { FieldWinnerRow } from '@/lib/analysis/types'

interface FieldWinnerMatrixProps {
  readonly rows: readonly FieldWinnerRow[]
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function FieldWinnerMatrix({ rows }: FieldWinnerMatrixProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Field Winners
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">Matrix view</h2>
        </div>
        <p className="max-w-md text-right text-sm text-gray-500">
          This table favors scanability over decoration. Fields can stay unresolved when the lead is not meaningful.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-gray-200 bg-white px-4 py-3 text-left font-semibold text-gray-900">
                Field
              </th>
              {TOOL_NAMES.map((tool) => (
                <th
                  key={tool}
                  className="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
                >
                  {TOOL_DISPLAY_NAMES[tool]}
                </th>
              ))}
              <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900">
                Winner
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field} className="align-top">
                <th className="sticky left-0 bg-white px-4 py-3 text-left font-medium text-gray-700">
                  {FIELD_LABELS[row.field]}
                </th>
                {TOOL_NAMES.map((tool) => {
                  const highlighted = row.winner === tool && !row.tooCloseToCall
                  return (
                    <td key={tool} className="border-t border-gray-100 px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 font-medium ${
                          highlighted
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {formatPercent(row.weightedScores[tool])}
                      </span>
                    </td>
                  )
                })}
                <td className="border-t border-gray-100 px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {row.tooCloseToCall
                      ? 'Too close to call'
                      : TOOL_DISPLAY_NAMES[row.winner!]}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Margin: {formatPercent(row.margin)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

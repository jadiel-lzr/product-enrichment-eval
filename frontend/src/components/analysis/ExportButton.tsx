import { downloadAnalysisCsv } from '@/lib/analysis/export'
import type { AnalysisExportPayload } from '@/hooks/useAnalysisState'

interface ExportButtonProps {
  readonly payload: AnalysisExportPayload
}

export function ExportButton({ payload }: ExportButtonProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Export
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">
            Download the current analysis snapshot
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            The CSV includes active filters, weights, full and filtered rankings, field winners, and completeness rows from the live view on screen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadAnalysisCsv(payload)}
          className="inline-flex items-center justify-center rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700"
        >
          Export CSV
        </button>
      </div>
    </section>
  )
}

import type { NoImgAnalysisStats } from '@/hooks/useNoImgAnalysis'

interface EnrichmentCoverageProps {
  readonly stats: NoImgAnalysisStats['enrichmentCoverage']
  readonly totalProducts: number
}

interface StatusBoxProps {
  readonly label: string
  readonly count: number
  readonly color: string
  readonly bgColor: string
}

function StatusBox({ label, count, color, bgColor }: StatusBoxProps) {
  return (
    <div className={`rounded-2xl border border-gray-200 p-4 text-center ${bgColor}`}>
      <p className={`text-2xl font-semibold ${color}`}>{count}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  )
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function EnrichmentCoverage({ stats, totalProducts }: EnrichmentCoverageProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
          Enrichment Coverage
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Overall and per-field fill rates
        </h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatusBox
          label="Success"
          count={stats.successCount}
          color="text-emerald-700"
          bgColor="bg-emerald-50"
        />
        <StatusBox
          label="Partial"
          count={stats.partialCount}
          color="text-amber-700"
          bgColor="bg-amber-50"
        />
        <StatusBox
          label="Failed"
          count={stats.failedCount}
          color="text-red-700"
          bgColor="bg-red-50"
        />
        <StatusBox
          label="Not Enriched"
          count={stats.notEnrichedCount}
          color="text-gray-700"
          bgColor="bg-gray-50"
        />
      </div>

      <div className="mb-5">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Overall Fill Rate
          </span>
          <span className="text-3xl font-semibold text-gray-900">
            {formatPercent(stats.overallFillRate)}
          </span>
          <span className="text-xs text-gray-400">
            of {totalProducts} products
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gray-900"
            style={{ width: `${Math.round(stats.overallFillRate * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {stats.fieldRates.map((field) => (
          <div key={field.field}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-700">{field.label}</span>
              <span className="font-medium text-gray-900">
                {formatPercent(field.rate)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gray-900"
                style={{ width: `${Math.round(field.rate * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

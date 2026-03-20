import type { NoImgAnalysisStats } from '@/hooks/useNoImgAnalysis'

interface UrlDiscoveryStatsProps {
  readonly stats: NoImgAnalysisStats['urlDiscovery']
  readonly totalProducts: number
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  none: 'bg-gray-400',
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  none: 'No Confidence',
}

function safePercent(count: number, total: number): string {
  if (total === 0) return '0'
  return (Math.round((count / total) * 1000) / 10).toString()
}

export function UrlDiscoveryStats({ stats, totalProducts }: UrlDiscoveryStatsProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
          URL Discovery
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Source URL confidence breakdown
        </h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-semibold text-gray-900">{stats.withSourceUrl}</p>
          <p className="mt-1 text-xs text-gray-500">
            Source URL Found ({safePercent(stats.withSourceUrl, totalProducts)}%)
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-semibold text-gray-900">{stats.withoutSourceUrl}</p>
          <p className="mt-1 text-xs text-gray-500">
            No Source URL ({safePercent(stats.withoutSourceUrl, totalProducts)}%)
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {stats.confidenceBreakdown.map((item) => (
          <div key={item.level}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-700">{CONFIDENCE_LABELS[item.level]}</span>
              <span className="font-medium text-gray-900">
                {item.count} ({item.percent}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${CONFIDENCE_COLORS[item.level]}`}
                style={{ width: `${Math.max(item.percent, 1)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

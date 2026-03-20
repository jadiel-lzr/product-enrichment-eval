import type { NoImgAnalysisStats } from '@/hooks/useNoImgAnalysis'

interface ImageQualityStatsProps {
  readonly stats: NoImgAnalysisStats['imageQuality']
  readonly totalProducts: number
}

const BUCKET_COLORS: Record<string, string> = {
  '0-2': 'bg-red-500',
  '3-4': 'bg-amber-500',
  '5-6': 'bg-yellow-500',
  '7-8': 'bg-emerald-500',
  '9-10': 'bg-emerald-700',
}

function safePercent(count: number, total: number): string {
  if (total === 0) return '0'
  return (Math.round((count / total) * 1000) / 10).toString()
}

interface StatBoxProps {
  readonly label: string
  readonly count: number
  readonly percent: string
  readonly color?: string
}

function StatBox({ label, count, percent, color }: StatBoxProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
      <p className={`text-2xl font-semibold ${color ?? 'text-gray-900'}`}>{count}</p>
      <p className="mt-1 text-xs text-gray-500">
        {label} ({percent}%)
      </p>
    </div>
  )
}

export function ImageQualityStats({ stats, totalProducts }: ImageQualityStatsProps) {
  const maxBucketCount = Math.max(...stats.scoreDistribution.map((b) => b.count), 1)

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
          Image Quality
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Image confidence distribution
        </h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatBox
          label="Has Images"
          count={stats.withImages}
          percent={safePercent(stats.withImages, totalProducts)}
        />
        <StatBox
          label="No Images"
          count={stats.withoutImages}
          percent={safePercent(stats.withoutImages, totalProducts)}
        />
        <StatBox
          label="No Flagged"
          count={stats.withImages - stats.withFlaggedImages}
          percent={safePercent(stats.withImages - stats.withFlaggedImages, totalProducts)}
          color={stats.withImages - stats.withFlaggedImages > 0 ? 'text-green-600' : undefined}
        />
        <StatBox
          label="Has Flagged"
          count={stats.withFlaggedImages}
          percent={safePercent(stats.withFlaggedImages, totalProducts)}
          color={stats.withFlaggedImages > 0 ? 'text-amber-600' : undefined}
        />
        <StatBox
          label="All Flagged"
          count={stats.allFlagged}
          percent={safePercent(stats.allFlagged, totalProducts)}
          color={stats.allFlagged > 0 ? 'text-red-600' : undefined}
        />
      </div>

      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Avg Confidence
        </span>
        {stats.averageConfidence !== null ? (
          <span className="text-3xl font-semibold text-gray-900">
            {stats.averageConfidence}
            <span className="text-lg text-gray-400"> / 10</span>
          </span>
        ) : (
          <span className="text-lg text-gray-400">N/A</span>
        )}
      </div>

      <div className="space-y-3">
        {stats.scoreDistribution.map((bucket) => (
          <div key={bucket.bucket}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-700">Score {bucket.bucket}</span>
              <span className="font-medium text-gray-900">{bucket.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${BUCKET_COLORS[bucket.bucket] ?? 'bg-gray-500'}`}
                style={{
                  width: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count > 0 ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

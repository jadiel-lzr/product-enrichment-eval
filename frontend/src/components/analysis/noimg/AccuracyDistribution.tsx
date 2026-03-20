import type { NoImgAnalysisStats } from '@/hooks/useNoImgAnalysis'

interface AccuracyDistributionProps {
  readonly stats: NoImgAnalysisStats['accuracy']
}

const BUCKET_COLORS: Record<string, string> = {
  '1-2': 'bg-red-500',
  '3-4': 'bg-amber-500',
  '5-6': 'bg-yellow-500',
  '7-8': 'bg-emerald-500',
  '9-10': 'bg-emerald-700',
}

export function AccuracyDistribution({ stats }: AccuracyDistributionProps) {
  const maxBucketCount = Math.max(...stats.distribution.map((b) => b.count), 1)

  if (stats.count === 0) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Accuracy Scores
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">
            Self-reported accuracy
          </h2>
        </div>
        <p className="text-sm text-gray-400">No accuracy scores available</p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
          Accuracy Scores
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Self-reported accuracy
        </h2>
      </div>

      <div className="mb-5">
        <span className="text-4xl font-semibold text-gray-900">
          {stats.average}
          <span className="text-xl text-gray-400"> / 10</span>
        </span>
        <p className="mt-1 text-xs text-gray-500">
          Average from {stats.count} products
        </p>
      </div>

      <div className="space-y-3">
        {stats.distribution.map((bucket) => (
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

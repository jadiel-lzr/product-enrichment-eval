import { TOOL_DISPLAY_NAMES } from '@/types/enrichment'
import type { AnalysisRankingSummary, ExecutiveTakeaway } from '@/lib/analysis/types'

interface ExecutiveSummaryProps {
  readonly fullDataset: AnalysisRankingSummary
  readonly filteredSlice: AnalysisRankingSummary
  readonly takeaways: readonly ExecutiveTakeaway[]
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function TrackBadge({ scoreTrack }: { readonly scoreTrack: 'confidence' | 'no-confidence' }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        scoreTrack === 'confidence'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {scoreTrack === 'confidence' ? 'Confidence-backed' : 'No-confidence track'}
    </span>
  )
}

function SummaryColumn({
  title,
  summary,
}: {
  readonly title: string
  readonly summary: AnalysisRankingSummary
}) {
  const leader = summary.confidenceRows[0] ?? summary.noConfidenceRows[0]

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">
            {leader ? TOOL_DISPLAY_NAMES[leader.tool] : 'No ranked tools yet'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {summary.totalProducts} products in scope
          </p>
        </div>
        {leader ? <TrackBadge scoreTrack={leader.scoreTrack} /> : null}
      </div>

      <div className="mt-5 space-y-3">
        {summary.rows.map((row, index) => (
          <article
            key={row.tool}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Rank {index + 1}
                </p>
                <h3 className="text-lg font-semibold text-gray-900">
                  {TOOL_DISPLAY_NAMES[row.tool]}
                </h3>
              </div>
              <TrackBadge scoreTrack={row.scoreTrack} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Blended</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatPercent(row.blendedScore)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Completeness</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatPercent(row.completenessScore)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Quality</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatPercent(row.weightedQualityScore)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-gray-500">
              {row.scoreTrack === 'confidence'
                ? `Uses real confidence scores from ${row.confidenceMetrics?.sampleSize ?? 0} rows.`
                : 'Visible in a separate no-confidence track because source data lacks usable confidence scores.'}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function ExecutiveSummary({
  fullDataset,
  filteredSlice,
  takeaways,
}: ExecutiveSummaryProps) {
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-gray-200 bg-linear-to-br from-white via-white to-gray-100 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
          Executive Summary
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
          Which tool wins overall
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          The full-dataset ranking stays stable for the big-picture story, while the filtered slice shows how the current product subset shifts the outcome.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SummaryColumn title="Full Dataset" summary={fullDataset} />
        <SummaryColumn title="Current Filtered Slice" summary={filteredSlice} />
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
              Takeaways
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">
              Read this before the detail tables
            </h2>
          </div>
          <span className="text-xs text-gray-400">
            Missing-confidence tools stay visible, never backfilled
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {takeaways.map((takeaway) => (
            <article
              key={takeaway.title}
              className={`rounded-2xl border p-4 ${
                takeaway.emphasis === 'positive'
                  ? 'border-emerald-200 bg-emerald-50'
                  : takeaway.emphasis === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-900">{takeaway.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{takeaway.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

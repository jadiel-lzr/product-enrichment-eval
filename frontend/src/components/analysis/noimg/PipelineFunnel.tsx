import type { NoImgAnalysisStats } from '@/hooks/useNoImgAnalysis'

interface PipelineFunnelProps {
  readonly steps: NoImgAnalysisStats['funnel']
}

const STEP_COLORS = [
  'bg-gray-900',
  'bg-gray-700',
  'bg-gray-500',
  'bg-gray-400',
  'bg-emerald-600',
] as const

function ChevronDown() {
  return (
    <div className="flex justify-center py-1 text-gray-300">
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  )
}

export function PipelineFunnel({ steps }: PipelineFunnelProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
          Pipeline Funnel
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Conversion at each pipeline step
        </h2>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.label}>
            {index > 0 ? <ChevronDown /> : null}
            <div className="flex items-center gap-4">
              <span className="w-36 shrink-0 text-sm font-medium text-gray-700">
                {step.label}
              </span>
              <div className="relative flex-1">
                <div className="h-8 overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className={`h-full rounded-lg transition-all ${STEP_COLORS[index] ?? 'bg-gray-500'}`}
                    style={{ width: `${Math.max(step.percent, 2)}%` }}
                  />
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold text-gray-900">
                {step.count}
              </span>
              <span className="w-14 shrink-0 text-right text-xs text-gray-500">
                {step.percent}%
              </span>
            </div>
            {step.label === 'Enriched' ? (
              <p className="ml-40 mt-1 text-xs text-gray-400">
                All products with at least 1 unflagged reachable image
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

interface AnalysisEmptyStateProps {
  readonly variant: 'no-products' | 'no-enrichment'
}

const COPY: Record<
  AnalysisEmptyStateProps['variant'],
  { title: string; body: string }
> = {
  'no-products': {
    title: 'No products match the current filters',
    body: 'Analysis uses the same sidebar filters as Compare mode. Adjust the shared filters to restore a product slice before ranking tools.',
  },
  'no-enrichment': {
    title: 'No enrichment data to analyze',
    body: 'Analysis cannot rank tools until at least one enriched CSV is available. Missing score tracks stay visible when data exists, but there is nothing loaded yet.',
  },
}

export function AnalysisEmptyState({ variant }: AnalysisEmptyStateProps) {
  const content = COPY[variant]

  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
      <div className="max-w-lg space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 6h16M4 12h16M4 18h7m5 0h4M15 12h5"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{content.title}</h2>
        <p className="text-sm leading-6 text-gray-500">{content.body}</p>
      </div>
    </div>
  )
}

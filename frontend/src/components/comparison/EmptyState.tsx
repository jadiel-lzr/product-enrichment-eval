interface EmptyStateProps {
  readonly variant: 'no-selection' | 'no-enrichment'
}

const COPY: Record<EmptyStateProps['variant'], { title: string; body: string }> = {
  'no-selection': {
    title: 'No product selected',
    body: 'Pick a product from the sidebar to compare enrichment output across tools.',
  },
  'no-enrichment': {
    title: 'No enrichment data available',
    body: 'Run the enrichment pipeline to generate comparison results for the selected product.',
  },
}

export function EmptyState({ variant }: EmptyStateProps) {
  const content = COPY[variant]

  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <div className="max-w-md space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17v-6h13M9 5v6h13M5 5h.01M5 12h.01M5 19h.01"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{content.title}</h2>
        <p className="text-sm text-gray-500">{content.body}</p>
      </div>
    </div>
  )
}

type AnalysisMode = 'compare' | 'analysis'

interface AnalysisModeToggleProps {
  readonly mode: AnalysisMode
  readonly onChange: (mode: AnalysisMode) => void
}

const MODES: ReadonlyArray<{
  id: AnalysisMode
  label: string
  description: string
}> = [
  {
    id: 'compare',
    label: 'Compare',
    description: 'Inspect one product across all tools.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Review aggregate winners, gaps, and exports.',
  },
]

export function AnalysisModeToggle({
  mode,
  onChange,
}: AnalysisModeToggleProps) {
  return (
    <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-100 p-1">
      {MODES.map((option) => {
        const active = option.id === mode

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-xl px-4 py-2 text-left transition ${
              active
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <div className="text-sm font-semibold">{option.label}</div>
            <div className="text-xs text-gray-500">{option.description}</div>
          </button>
        )
      })}
    </div>
  )
}

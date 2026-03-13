interface AccuracyScoreProps {
  readonly score?: number
}

const SCORE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 50,
} as const

function getScoreColor(score: number): string {
  if (score >= SCORE_THRESHOLDS.HIGH) return 'text-green-600'
  if (score >= SCORE_THRESHOLDS.MEDIUM) return 'text-amber-600'
  return 'text-red-600'
}

export function AccuracyScore({ score }: AccuracyScoreProps) {
  if (score === undefined || score === null) {
    return null
  }

  const colorClass = getScoreColor(score)

  return (
    <span className="inline-flex items-center gap-1" title="LLM accuracy score">
      <span className="text-xs text-gray-400">LLM Score</span>
      <span className={`text-sm font-semibold ${colorClass}`}>{score}%</span>
    </span>
  )
}

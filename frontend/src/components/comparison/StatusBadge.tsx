interface StatusBadgeProps {
  readonly status: 'success' | 'partial' | 'failed'
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
} as const

const STATUS_LABELS: Record<string, string> = {
  success: 'Success',
  partial: 'Partial',
  failed: 'Failed',
} as const

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

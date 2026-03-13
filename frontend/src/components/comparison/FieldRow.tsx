import { useState } from 'react'
import type { FieldStatus } from '@/types/enrichment'
import { getFieldColor } from '@/lib/field-diff'

interface FieldRowProps {
  readonly fieldName: string
  readonly label: string
  readonly enrichedValue?: string
  readonly originalValue?: string
  readonly status: FieldStatus
}

const DESCRIPTION_FIELD = 'description_eng'
const TRUNCATE_LENGTH = 100

export function FieldRow({
  fieldName,
  label,
  enrichedValue,
  originalValue,
  status,
}: FieldRowProps) {
  const [expanded, setExpanded] = useState(false)
  const colors = getFieldColor(status)

  const displayValue = enrichedValue?.trim() || originalValue?.trim() || ''
  const isDescription = fieldName === DESCRIPTION_FIELD
  const isLong = isDescription && displayValue.length > TRUNCATE_LENGTH
  const shouldTruncate = isLong && !expanded

  const visibleValue = shouldTruncate
    ? `${displayValue.slice(0, TRUNCATE_LENGTH)}...`
    : displayValue

  return (
    <div
      className={`flex items-start gap-3 rounded border-l-4 px-3 py-2 ${colors.border} ${colors.bg}`}
    >
      <span className="w-28 shrink-0 pt-0.5 text-xs font-medium text-gray-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        {status === 'missing' ? (
          <span className="text-sm italic text-amber-600">Not enriched</span>
        ) : (
          <>
            <span className={`text-sm ${colors.text}`}>{visibleValue}</span>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

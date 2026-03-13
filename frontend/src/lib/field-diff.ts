import type { FieldStatus } from '@/types/enrichment'

interface FieldColors {
  readonly border: string
  readonly bg: string
  readonly text: string
}

const FIELD_COLOR_MAP: Record<FieldStatus, FieldColors> = {
  enriched: {
    border: 'border-green-500',
    bg: 'bg-green-50',
    text: 'text-green-700',
  },
  unchanged: {
    border: 'border-gray-300',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
  },
  missing: {
    border: 'border-amber-400',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
} as const

/**
 * Determine the enrichment status of a field by comparing enriched vs original values.
 *
 * - 'enriched': enrichedValue is non-empty AND differs from originalValue (or originalValue was empty)
 * - 'unchanged': enrichedValue equals originalValue and both are non-empty
 * - 'missing': enrichedValue is empty/undefined (field was targeted but not filled)
 */
export function getFieldStatus(
  _fieldName: string,
  enrichedValue: string | undefined,
  originalValue: string | undefined,
): FieldStatus {
  const enriched = (enrichedValue ?? '').trim()
  const original = (originalValue ?? '').trim()

  if (!enriched) {
    return 'missing'
  }

  if (original && enriched === original) {
    return 'unchanged'
  }

  return 'enriched'
}

/**
 * Get Tailwind CSS classes for a given field status.
 */
export function getFieldColor(status: FieldStatus): FieldColors {
  return FIELD_COLOR_MAP[status]
}

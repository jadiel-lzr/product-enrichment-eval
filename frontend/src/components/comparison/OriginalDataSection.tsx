import { useState } from 'react'
import type { Product } from '@/types/enrichment'
import { CORE_ENRICHMENT_FIELDS, FIELD_LABELS } from '@/types/enrichment'

interface OriginalDataSectionProps {
  readonly product: Product
}

function getOriginalFieldValue(product: Product, field: string): string {
  const value = (product as Record<string, unknown>)[field]
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export function OriginalDataSection({ product }: OriginalDataSectionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-100">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-gray-700">Original Data</span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-1 border-t border-gray-200 px-4 py-3">
          {[
            { key: 'feed_name', label: 'Feed Name' },
            { key: 'code', label: 'Code' },
            { key: 'model', label: 'Model' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-start gap-3 py-1">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                {label}
              </span>
              <span className="min-w-0 flex-1 text-sm text-gray-700">
                {getOriginalFieldValue(product, key) || <span className="italic text-gray-400">Empty</span>}
              </span>
            </div>
          ))}
          {CORE_ENRICHMENT_FIELDS.map((field) => {
            const value = getOriginalFieldValue(product, field)
            return (
              <div key={field} className="flex items-start gap-3 py-1">
                <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                  {FIELD_LABELS[field]}
                </span>
                <span className="min-w-0 flex-1 text-sm text-gray-700">
                  {value || <span className="italic text-gray-400">Empty</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

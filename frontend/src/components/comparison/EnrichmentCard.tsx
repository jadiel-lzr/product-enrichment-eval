import { useMemo, useState } from 'react'
import {
  CORE_ENRICHMENT_FIELDS,
  FIELD_LABELS,
  TOOL_DISPLAY_NAMES,
  type Product,
  type ToolEnrichment,
} from '@/types/enrichment'
import { getFieldStatus } from '@/lib/field-diff'
import { AccuracyScore } from './AccuracyScore'
import { FieldRow } from './FieldRow'
import { StatusBadge } from './StatusBadge'

interface EnrichmentCardProps {
  readonly enrichment: ToolEnrichment
  readonly product: Product
}

function getProductValue(product: Product, field: string): string | undefined {
  const rawValue = (product as Record<string, unknown>)[field]

  if (rawValue === undefined || rawValue === null) {
    return undefined
  }

  if (Array.isArray(rawValue)) {
    return rawValue.join(', ')
  }

  return String(rawValue)
}

export function EnrichmentCard({ enrichment, product }: EnrichmentCardProps) {
  const [showAdditionalFields, setShowAdditionalFields] = useState(false)

  const additionalFields = useMemo(
    () =>
      Object.entries(enrichment.enrichedValues).filter(
        ([fieldName]) => !CORE_ENRICHMENT_FIELDS.includes(fieldName as never),
      ),
    [enrichment.enrichedValues],
  )

  return (
    <article
      className={`min-h-[28rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${
        enrichment.status === 'failed' ? 'opacity-60' : ''
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {TOOL_DISPLAY_NAMES[enrichment.tool]}
            </h2>
            <StatusBadge status={enrichment.status} />
          </div>
          <p className="text-sm text-gray-500">
            {enrichment.fieldsEnriched}/{enrichment.totalFields} fields
          </p>
        </div>
        <AccuracyScore score={enrichment.accuracyScore} />
      </header>

      {enrichment.status === 'failed' ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {enrichment.error || 'This tool failed to produce enrichment output.'}
        </div>
      ) : null}

      <div className="space-y-2.5">
        {CORE_ENRICHMENT_FIELDS.map((fieldName) => {
          const enrichedValue = enrichment.enrichedValues[fieldName]
          const originalValue = getProductValue(product, fieldName)

          return (
            <FieldRow
              key={fieldName}
              fieldName={fieldName}
              label={FIELD_LABELS[fieldName]}
              enrichedValue={enrichedValue}
              originalValue={originalValue}
              status={getFieldStatus(fieldName, enrichedValue, originalValue)}
            />
          )
        })}
      </div>

      {enrichment.sourceUrl ? (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-start gap-3">
            <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
              Image(s) Source Url
            </span>
            <a
              href={enrichment.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              {enrichment.sourceUrl}
            </a>
          </div>
        </div>
      ) : null}

      {enrichment.imageLinks && enrichment.imageLinks.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <span className="text-xs font-medium text-gray-500">
            Enriched Images ({enrichment.imageLinks.length})
          </span>
          <div className="grid grid-cols-2 gap-2">
            {enrichment.imageLinks.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-blue-300 hover:shadow-sm"
              >
                <img
                  src={url}
                  alt="Enriched product"
                  className="h-32 w-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling
                    if (fallback instanceof HTMLElement) {
                      fallback.style.display = 'flex'
                    }
                  }}
                />
                <div className="hidden h-32 w-full flex-col items-center justify-center gap-1 text-gray-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                  <span className="text-xs">Failed to load</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {additionalFields.length > 0 ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAdditionalFields((current) => !current)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            {showAdditionalFields ? 'Hide additional fields' : 'Show additional fields'}
          </button>

          {showAdditionalFields ? (
            <div className="mt-3 space-y-2">
              {additionalFields.map(([fieldName, fieldValue]) => (
                <FieldRow
                  key={fieldName}
                  fieldName={fieldName}
                  label={fieldName}
                  enrichedValue={fieldValue}
                  originalValue={getProductValue(product, fieldName)}
                  status={getFieldStatus(
                    fieldName,
                    fieldValue,
                    getProductValue(product, fieldName),
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

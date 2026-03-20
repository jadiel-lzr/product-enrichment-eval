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
  readonly genericTitle?: boolean
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

export function EnrichmentCard({ enrichment, product, genericTitle }: EnrichmentCardProps) {
  const [showAdditionalFields, setShowAdditionalFields] = useState(false)

  const additionalFields = useMemo(
    () =>
      Object.entries(enrichment.enrichedValues).filter(
        ([fieldName]) => !CORE_ENRICHMENT_FIELDS.includes(fieldName as never),
      ),
    [enrichment.enrichedValues],
  )

  const hasImageConfidenceBadge = enrichment.imageConfidence === 'verified' || enrichment.imageConfidence === 'variant_uncertain'
  const hasUrlDiscovery = Boolean(enrichment.confidenceScore || enrichment.matchReason || hasImageConfidenceBadge)
  const showFailedState = enrichment.status === 'failed' && !hasUrlDiscovery

  return (
    <article
      className={`min-h-[28rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${
        showFailedState ? 'opacity-60' : ''
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {genericTitle ? 'Enriched Data' : TOOL_DISPLAY_NAMES[enrichment.tool]}
            </h2>
            <StatusBadge status={enrichment.status} />
          </div>
          <p className="text-sm text-gray-500">
            {enrichment.fieldsEnriched}/{enrichment.totalFields} fields
          </p>
        </div>
        <AccuracyScore score={enrichment.accuracyScore} />
      </header>

      {showFailedState ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {enrichment.error || 'This tool failed to produce enrichment output.'}
        </div>
      ) : null}

      {enrichment.confidenceScore || enrichment.matchReason || enrichment.sourceUrl || hasImageConfidenceBadge ? (
        <div className="mb-4 space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            URL Discovery
          </span>
          {enrichment.confidenceScore ? (
            <div className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                Confidence
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  enrichment.confidenceScore === 'high'
                    ? 'bg-green-100 text-green-700'
                    : enrichment.confidenceScore === 'medium'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {enrichment.confidenceScore}
              </span>
            </div>
          ) : null}
          {enrichment.imageConfidence === 'verified' ? (
            <div className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                Image Match
              </span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                verified
              </span>
            </div>
          ) : enrichment.imageConfidence === 'variant_uncertain' ? (
            <div className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                Image Match
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Multiple variants — color unknown
              </span>
            </div>
          ) : null}
          {enrichment.matchReason ? (
            <div className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                Match Reason
              </span>
              <span className="min-w-0 flex-1 text-sm text-gray-700">
                {enrichment.matchReason}
              </span>
            </div>
          ) : null}
          {enrichment.sourceUrl ? (
            <div className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
                Source URL
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
          ) : null}
        </div>
      ) : null}

      {enrichment.imageLinks && enrichment.imageLinks.length > 0 ? (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Found Images ({enrichment.imageLinks.length})
            </span>
            {enrichment.imageFlags && enrichment.imageFlags.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {enrichment.imageFlags.length} flagged
              </span>
            ) : null}
          </div>
          <div
            className={
              enrichment.imageLinks.length === 1
                ? 'flex'
                : 'grid grid-cols-2 gap-3'
            }
          >
            {enrichment.imageLinks.map((url, index) => {
              const flag = enrichment.imageFlags?.find((f) => f.url === url)
              const isFlagged = Boolean(flag)

              return (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group relative overflow-hidden rounded-xl border shadow-sm transition hover:shadow-md ${
                    isFlagged
                      ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                      : 'border-gray-200 bg-white hover:border-blue-400'
                  } ${enrichment.imageLinks!.length === 1 ? 'w-full max-w-xs' : ''}`}
                >
                  <div className="absolute top-2 left-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {index + 1} of {enrichment.imageLinks!.length}
                  </div>
                  {isFlagged ? (
                    <div
                      className="absolute top-2 right-2 z-10 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white"
                      title={flag!.reason}
                    >
                      Flagged
                    </div>
                  ) : null}
                  <img
                    src={url}
                    alt={`Product image ${index + 1}`}
                    className={`h-48 w-full object-contain p-2 ${isFlagged ? 'opacity-50' : ''}`}
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = 'none'
                      const fallback = target.nextElementSibling
                      if (fallback instanceof HTMLElement) {
                        fallback.style.display = 'flex'
                      }
                    }}
                  />
                  <div className="hidden h-48 w-full flex-col items-center justify-center gap-1 text-gray-400">
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
                  <div className={`border-t px-3 py-1.5 text-center text-xs transition ${
                    isFlagged
                      ? 'border-amber-200 text-amber-600'
                      : 'border-gray-100 text-gray-400 group-hover:text-blue-500'
                  }`}>
                    {isFlagged ? flag!.reason : 'Open full size'}
                  </div>
                </a>
              )
            })}
          </div>
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

import { useEffect, useMemo, useRef } from 'react'
import { useProductContext } from '@/context/ProductContext'
import {
  TOOL_DISPLAY_NAMES,
  TOOL_NAMES,
  type Product,
  type ToolEnrichment,
  type ToolName,
} from '@/types/enrichment'
import { EmptyState } from './EmptyState'
import { EnrichmentCard } from './EnrichmentCard'
import { ProductHeader } from './ProductHeader'

function EmptyCard({ tool }: { readonly tool: ToolName }) {
  return (
    <div className="flex min-h-112 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-gray-700">
          {TOOL_DISPLAY_NAMES[tool]}
        </h3>
        <p className="text-sm text-gray-500">No data from this tool yet.</p>
      </div>
    </div>
  )
}

function renderAvailabilityList(
  tools: readonly ToolName[],
  fallback: string,
): string {
  if (tools.length === 0) {
    return fallback
  }

  return tools.map((tool) => TOOL_DISPLAY_NAMES[tool]).join(', ')
}

export function ComparisonView() {
  const {
    products,
    enrichmentsByProduct,
    selectedSku,
    availableTools,
  } = useProductContext()
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedProduct = useMemo<Product | null>(
    () => products.find((product) => product.sku === selectedSku) ?? null,
    [products, selectedSku],
  )

  const enrichments = useMemo<readonly ToolEnrichment[]>(
    () =>
      selectedSku ? (enrichmentsByProduct.get(selectedSku) ?? []) : [],
    [enrichmentsByProduct, selectedSku],
  )

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedSku])

  if (!selectedSku || !selectedProduct) {
    return <EmptyState variant="no-selection" />
  }

  if (availableTools.length === 0 || enrichments.length === 0) {
    return <EmptyState variant="no-enrichment" />
  }

  // Determine layout based on how many tools have data for THIS product
  const productToolCount = enrichments.length
  const isMultiTool = productToolCount > 1 && availableTools.length > 1

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 md:p-6">
        <ProductHeader product={selectedProduct} />

        {isMultiTool ? (
          <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">Showing:</span>{' '}
              {renderAvailabilityList(
                enrichments.map((e) => e.tool),
                'None',
              )}
            </p>
            {availableTools.length > enrichments.length ? (
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-medium text-gray-900">Missing:</span>{' '}
                {renderAvailabilityList(
                  TOOL_NAMES.filter(
                    (t) => !enrichments.some((e) => e.tool === t),
                  ),
                  'None',
                )}
              </p>
            ) : null}
          </section>
        ) : null}

        <section
          className={
            isMultiTool
              ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
              : 'space-y-4'
          }
        >
          {isMultiTool
            ? TOOL_NAMES.map((tool) => {
                const enrichment = enrichments.find(
                  (entry) => entry.tool === tool,
                )

                if (!enrichment) {
                  return <EmptyCard key={tool} tool={tool} />
                }

                return (
                  <EnrichmentCard
                    key={tool}
                    enrichment={enrichment}
                    product={selectedProduct}
                  />
                )
              })
            : enrichments.map((enrichment) => (
                <EnrichmentCard
                  key={enrichment.tool}
                  enrichment={enrichment}
                  product={selectedProduct}
                  genericTitle
                />
              ))}
        </section>
      </div>
    </div>
  )
}

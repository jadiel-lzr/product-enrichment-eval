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

function getToolAvailability(enrichments: readonly ToolEnrichment[]) {
  const availableTools = new Set(enrichments.map((entry) => entry.tool))

  return {
    available: TOOL_NAMES.filter((tool) => availableTools.has(tool)),
    missing: TOOL_NAMES.filter((tool) => !availableTools.has(tool)),
  }
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

  const toolAvailability = getToolAvailability(enrichments)

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 md:p-6">
        <ProductHeader product={selectedProduct} />

        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">Showing:</span>{' '}
            {renderAvailabilityList(toolAvailability.available, 'None')}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-medium text-gray-900">Missing:</span>{' '}
            {renderAvailabilityList(toolAvailability.missing, 'None')}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TOOL_NAMES.map((tool) => {
            const enrichment = enrichments.find((entry) => entry.tool === tool)

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
          })}
        </section>
      </div>
    </div>
  )
}

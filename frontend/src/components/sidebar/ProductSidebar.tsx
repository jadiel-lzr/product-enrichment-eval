import { useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useProducts } from '@/context/ProductContext'
import { FilterBar } from './FilterBar'
import { ProductListItem } from './ProductListItem'

const SIDEBAR_WIDTH_EXPANDED = 320
const SIDEBAR_WIDTH_COLLAPSED = 48
const ESTIMATED_ROW_HEIGHT = 60
const ESTIMATED_ROW_HEIGHT_COMPACT = 40

function CollapseToggle({
  collapsed,
  onToggle,
}: {
  readonly collapsed: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {collapsed ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 5l7 7-7 7M5 5l7 7-7 7"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        )}
      </svg>
    </button>
  )
}

export function ProductSidebar() {
  const { filteredProducts, selectedSku, setSelectedSku, enrichmentsByProduct } = useProducts()
  const [collapsed, setCollapsed] = useState(false)

  const parentRef = useRef<HTMLDivElement>(null)

  const estimateSize = collapsed ? ESTIMATED_ROW_HEIGHT_COMPACT : ESTIMATED_ROW_HEIGHT

  const virtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
  })

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-[width] duration-200"
      style={{ width: sidebarWidth }}
    >
      <div
        className={`flex items-center border-b border-gray-200 bg-gray-50/95 backdrop-blur ${collapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'}`}
      >
        {!collapsed && (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Products
          </span>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {!collapsed && (
        <div className="sticky top-0 z-10 px-3 pt-2">
          <FilterBar />
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-auto">
        {filteredProducts.length === 0 && !collapsed ? (
          <div className="px-4 py-6 text-sm text-gray-500">
            No products match the current filters.
          </div>
        ) : null}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const product = filteredProducts[virtualItem.index]
            if (!product) {
              return null
            }
            const enrichments = enrichmentsByProduct.get(product.sku)
            const enrichedImageCount = enrichments?.reduce(
              (count, e) => count + (e.imageLinks?.length ?? 0),
              0,
            ) ?? 0
            return (
              <div
                key={product.sku}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={collapsed ? 'px-1' : 'px-2'}
              >
                <ProductListItem
                  product={product}
                  isSelected={selectedSku === product.sku}
                  onClick={() => setSelectedSku(product.sku)}
                  compact={collapsed}
                  enrichedImageCount={enrichedImageCount}
                />
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

import { BrowserRouter } from 'react-router-dom'
import { ProductProvider, useProducts } from '@/context/ProductContext'

function SkeletonSidebar() {
  return (
    <aside className="w-80 shrink-0 border-r border-gray-200 bg-white p-4">
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded-md bg-gray-200" />
        <div className="h-8 animate-pulse rounded-md bg-gray-200" />
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg p-2">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

function SkeletonComparison() {
  return (
    <main className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="h-20 w-20 shrink-0 animate-pulse rounded bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-6 w-64 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-4 w-2 animate-pulse rounded bg-gray-200" />
                    <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="h-4 flex-1 animate-pulse rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function AppContent() {
  const { loading, error, filteredProducts, availableTools } = useProducts()

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-900">
          Product Enrichment Eval
        </h1>
        <span className="text-sm text-gray-500">
          {loading
            ? 'Loading products...'
            : error
              ? 'Error loading data'
              : `${filteredProducts.length} products | ${availableTools.length} tools`}
        </span>
      </header>

      {error ? (
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <h2 className="mb-2 text-lg font-medium text-red-800">
              Failed to load data
            </h2>
            <p className="text-sm text-red-600">{error}</p>
            <p className="mt-3 text-xs text-red-500">
              Make sure to run <code className="rounded bg-red-100 px-1">npm run copy-data</code> first.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {loading ? (
            <>
              <SkeletonSidebar />
              <SkeletonComparison />
            </>
          ) : (
            <>
              {/* Sidebar placeholder - implemented in Plan 02 */}
              <aside className="w-80 shrink-0 border-r border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">
                  Sidebar ({filteredProducts.length} products)
                </p>
              </aside>

              {/* Comparison area placeholder - implemented in Plan 03 */}
              <main className="flex-1 overflow-auto bg-gray-50 p-6">
                <p className="text-sm text-gray-500">
                  Comparison ({availableTools.length} tools available)
                </p>
              </main>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ProductProvider>
        <AppContent />
      </ProductProvider>
    </BrowserRouter>
  )
}

export default App

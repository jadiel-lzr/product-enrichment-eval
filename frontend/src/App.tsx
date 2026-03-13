import { BrowserRouter } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <h1 className="text-lg font-semibold text-gray-900">
            Product Enrichment Eval
          </h1>
          <span className="text-sm text-gray-500">Loading products...</span>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar placeholder */}
          <aside className="w-80 shrink-0 border-r border-gray-200 bg-white p-4">
            <div className="space-y-3">
              <div className="h-10 animate-pulse rounded-md bg-gray-200" />
              <div className="h-8 animate-pulse rounded-md bg-gray-200" />
              <div className="space-y-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg p-2"
                  >
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

          {/* Comparison area placeholder */}
          <main className="flex-1 overflow-auto bg-gray-50 p-6">
            <div className="space-y-4">
              {/* Product header skeleton */}
              <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="h-20 w-20 shrink-0 animate-pulse rounded bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                  <div className="h-6 w-64 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
                </div>
              </div>

              {/* 2x2 cards grid skeleton */}
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
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App

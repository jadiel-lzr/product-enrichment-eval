import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, useSearchParams } from 'react-router-dom'
import { ProductProvider, useProducts } from '@/context/ProductContext'
import { AnalysisModeToggle } from '@/components/analysis/AnalysisModeToggle'
import { AnalysisView } from '@/components/analysis/AnalysisView'
import { NoImgAnalysisView } from '@/components/analysis/noimg/NoImgAnalysisView'
import { ComparisonView } from '@/components/comparison/ComparisonView'
import { ProductSidebar } from '@/components/sidebar/ProductSidebar'
import { DatasetTabs } from '@/components/DatasetTabs'
import { DATASET_CONFIGS, type DatasetId } from '@/types/dataset'

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

function useMediaQuery(query: string): boolean {
  const getMatch = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches

  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const onChange = () => setMatches(mediaQuery.matches)

    onChange()
    mediaQuery.addEventListener('change', onChange)

    return () => {
      mediaQuery.removeEventListener('change', onChange)
    }
  }, [query])

  return matches
}

function ResponsiveSidebar() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [open, setOpen] = useState(false)
  const sidebarOpen = open && !isDesktop

  if (isDesktop) {
    return <ProductSidebar />
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
      >
        <MenuIcon />
        Browse products
      </button>

      {sidebarOpen ? (
        <>
          <button
            type="button"
            aria-label="Close product browser"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-gray-950/40"
          />
          <div
            className={`fixed z-40 overflow-hidden bg-white shadow-2xl ${
              isMobile
                ? 'inset-x-0 bottom-0 top-24 rounded-t-3xl border-t border-gray-200'
                : 'bottom-0 left-0 top-0 w-88 border-r border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Products</p>
                <p className="text-xs text-gray-500">
                  Mobile uses a bottom sheet, tablet uses a drawer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <CloseIcon />
              </button>
            </div>
            <ProductSidebar />
          </div>
        </>
      ) : null}
    </>
  )
}

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
  const { loading, error, filteredProducts, availableTools, datasetId } = useProducts()
  const isNoImgDataset = datasetId === 'without-images'
  const showToggle = availableTools.length > 1 || isNoImgDataset
  const [mode, setMode] = useState<'compare' | 'analysis'>('compare')

  return (
    <>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Product Enrichment Eval
            </h1>
            <p className="text-sm text-gray-500">
              {loading
                ? 'Loading products...'
                : error
                  ? 'Error loading data'
                  : `${filteredProducts.length} products | ${availableTools.length} tools`}
            </p>
          </div>
          {!loading && !error && showToggle ? (
            <AnalysisModeToggle mode={mode} onChange={setMode} />
          ) : null}
        </div>
        <span className="text-sm text-gray-500">
          Shared filters power both views
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
              <ResponsiveSidebar />

              <main className="min-w-0 flex-1 overflow-hidden bg-gray-50">
                {mode === 'compare' ? (
                  <ComparisonView />
                ) : isNoImgDataset ? (
                  <NoImgAnalysisView />
                ) : (
                  <AnalysisView />
                )}
              </main>
            </>
          )}
        </div>
      )}
    </>
  )
}

function isValidDatasetId(value: string | null): value is DatasetId {
  return value === 'with-images' || value === 'without-images'
}

function AppShell() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawDataset = searchParams.get('dataset')
  const datasetId: DatasetId = isValidDatasetId(rawDataset) ? rawDataset : 'with-images'
  const config = DATASET_CONFIGS[datasetId]

  const handleDatasetChange = useCallback(
    (nextDataset: DatasetId) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams()
          next.set('dataset', nextDataset)
          if (current.toString() === next.toString()) return current
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  return (
    <div className="flex h-screen flex-col">
      <DatasetTabs activeDataset={datasetId} onChange={handleDatasetChange} />
      <ProductProvider dataset={config} key={config.id}>
        <AppContent />
      </ProductProvider>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App

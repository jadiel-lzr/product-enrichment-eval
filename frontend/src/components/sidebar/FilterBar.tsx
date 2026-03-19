import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useProducts } from '@/context/ProductContext'
import { EMPTY_FILTERS, TOOL_DISPLAY_NAMES } from '@/types/enrichment'
import { FilterDropdown } from './FilterDropdown'

const DEBOUNCE_MS = 200

const CONFIDENCE_OPTIONS = ['high', 'medium', 'low'] as const
const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

function hasActiveFilters(filters: {
  search: string
  brand: string
  category: string
  department: string
  enrichedBy: string
  confidence: string
}): boolean {
  return Boolean(
    filters.search || filters.brand || filters.category || filters.department || filters.enrichedBy || filters.confidence,
  )
}

export function FilterBar() {
  const {
    filters,
    setFilters,
    products,
    filteredProducts,
    brands,
    categories,
    departments,
    availableTools,
    enrichmentsByProduct,
    datasetId,
  } = useProducts()

  const isWithImages = datasetId === 'with-images'

  const hasConfidenceData = useMemo(() => {
    for (const enrichments of enrichmentsByProduct.values()) {
      for (const e of enrichments) {
        if (e.confidenceScore) return true
      }
    }
    return false
  }, [enrichmentsByProduct])

  const enrichedByOptions = useMemo(() => {
    if (!isWithImages) return []
    return ['all', ...availableTools]
  }, [isWithImages, availableTools])

  const enrichedByLabels = useMemo<Record<string, string>>(() => {
    return { all: 'All Tools', ...TOOL_DISPLAY_NAMES }
  }, [])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchValue, setSearchValue] = useState(filters.search)

  useEffect(() => {
    setSearchValue(filters.search)
  }, [filters.search])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const search = e.target.value
      setSearchValue(search)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        setFilters({ ...filters, search: search.trimStart() })
      }, DEBOUNCE_MS)
    },
    [filters, setFilters],
  )

  const handleBrandChange = useCallback(
    (brand: string) => setFilters({ ...filters, brand }),
    [filters, setFilters],
  )

  const handleCategoryChange = useCallback(
    (category: string) => setFilters({ ...filters, category }),
    [filters, setFilters],
  )

  const handleDepartmentChange = useCallback(
    (department: string) => setFilters({ ...filters, department }),
    [filters, setFilters],
  )

  const handleEnrichedByChange = useCallback(
    (enrichedBy: string) => setFilters({ ...filters, enrichedBy }),
    [filters, setFilters],
  )

  const handleConfidenceChange = useCallback(
    (confidence: string) => setFilters({ ...filters, confidence }),
    [filters, setFilters],
  )

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS)
  }, [setFilters])

  const showClear = hasActiveFilters(filters)

  return (
    <div className="space-y-2 border-b border-gray-200 pb-3">
      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
          <SearchIcon />
        </div>
        <input
          type="text"
          placeholder="Search products..."
          value={searchValue}
          onChange={handleSearchChange}
          className="w-full rounded border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap gap-1.5">
        <FilterDropdown
          label="All Brands"
          value={filters.brand}
          options={brands}
          onChange={handleBrandChange}
        />
        <FilterDropdown
          label="All Categories"
          value={filters.category}
          options={categories}
          onChange={handleCategoryChange}
        />
        <FilterDropdown
          label="All Departments"
          value={filters.department}
          options={departments}
          onChange={handleDepartmentChange}
        />
        {enrichedByOptions.length > 0 ? (
          <FilterDropdown
            label="Enriched By"
            value={filters.enrichedBy}
            options={enrichedByOptions}
            displayLabels={enrichedByLabels}
            onChange={handleEnrichedByChange}
          />
        ) : null}
        {hasConfidenceData ? (
          <FilterDropdown
            label="Confidence"
            value={filters.confidence}
            options={[...CONFIDENCE_OPTIONS]}
            displayLabels={CONFIDENCE_LABELS}
            onChange={handleConfidenceChange}
          />
        ) : null}
      </div>

      {/* Match count and clear */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Showing {filteredProducts.length} of {products.length} products
        </span>
        {showClear && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-blue-600 transition-colors hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

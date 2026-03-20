import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useProducts } from '@/context/ProductContext'
import { EMPTY_FILTERS, TOOL_DISPLAY_NAMES } from '@/types/enrichment'
import { FilterDropdown } from './FilterDropdown'

const DEBOUNCE_MS = 200

const URL_CONFIDENCE_OPTIONS = ['high', 'medium', 'low'] as const
const URL_CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const IMAGE_CONFIDENCE_OPTIONS = ['high', 'medium', 'low'] as const
const IMAGE_CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High (8-10)',
  medium: 'Medium (5-7)',
  low: 'Low (0-4)',
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

const YES_NO_OPTIONS = ['yes', 'no'] as const
const YES_NO_LABELS: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
}

function hasActiveFilters(filters: {
  search: string
  brand: string
  category: string
  department: string
  enrichedBy: string
  confidence: string
  imageConfidence: string
  sourceUrlFound: string
  imageLinksFound: string
}): boolean {
  return Boolean(
    filters.search || filters.brand || filters.category || filters.department || filters.enrichedBy || filters.confidence || filters.imageConfidence || filters.sourceUrlFound || filters.imageLinksFound,
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

  const hasImageConfidenceData = useMemo(() => {
    for (const enrichments of enrichmentsByProduct.values()) {
      for (const e of enrichments) {
        if (typeof e.imageConfidence === 'number') return true
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
        setFilters({ search: search.trimStart() })
      }, DEBOUNCE_MS)
    },
    [setFilters],
  )

  const handleBrandChange = useCallback(
    (brand: string) => setFilters({ brand }),
    [setFilters],
  )

  const handleCategoryChange = useCallback(
    (category: string) => setFilters({ category }),
    [setFilters],
  )

  const handleDepartmentChange = useCallback(
    (department: string) => setFilters({ department }),
    [setFilters],
  )

  const handleEnrichedByChange = useCallback(
    (enrichedBy: string) => setFilters({ enrichedBy }),
    [setFilters],
  )

  const handleConfidenceChange = useCallback(
    (confidence: string) => setFilters({ confidence }),
    [setFilters],
  )

  const handleImageConfidenceChange = useCallback(
    (imageConfidence: string) => setFilters({ imageConfidence }),
    [setFilters],
  )

  const handleSourceUrlFoundChange = useCallback(
    (sourceUrlFound: string) => setFilters({ sourceUrlFound }),
    [setFilters],
  )

  const handleImageLinksFoundChange = useCallback(
    (imageLinksFound: string) => setFilters({ imageLinksFound }),
    [setFilters],
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
            label="URL Confidence"
            value={filters.confidence}
            options={[...URL_CONFIDENCE_OPTIONS]}
            displayLabels={URL_CONFIDENCE_LABELS}
            onChange={handleConfidenceChange}
          />
        ) : null}
        {hasImageConfidenceData ? (
          <FilterDropdown
            label="Image Confidence"
            value={filters.imageConfidence}
            options={[...IMAGE_CONFIDENCE_OPTIONS]}
            displayLabels={IMAGE_CONFIDENCE_LABELS}
            onChange={handleImageConfidenceChange}
          />
        ) : null}
        {!isWithImages ? (
          <FilterDropdown
            label="Source URL"
            value={filters.sourceUrlFound}
            options={[...YES_NO_OPTIONS]}
            displayLabels={YES_NO_LABELS}
            onChange={handleSourceUrlFoundChange}
          />
        ) : null}
        {!isWithImages ? (
          <FilterDropdown
            label="Image Links"
            value={filters.imageLinksFound}
            options={[...YES_NO_OPTIONS]}
            displayLabels={YES_NO_LABELS}
            onChange={handleImageLinksFoundChange}
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

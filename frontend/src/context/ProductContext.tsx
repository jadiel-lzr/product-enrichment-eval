import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useProductData } from '@/hooks/useProductData'
import { useUrlParams } from '@/hooks/useUrlParams'
import {
  TOOL_NAMES,
  type FilterState,
  type Product,
  type ToolEnrichment,
  type ToolName,
} from '@/types/enrichment'
import type { DatasetConfig, DatasetId } from '@/types/dataset'

interface ProductContextValue {
  readonly datasetId: DatasetId
  readonly products: Product[]
  readonly enrichmentsByProduct: Map<string, ToolEnrichment[]>
  readonly selectedSku: string | null
  readonly setSelectedSku: (sku: string) => void
  readonly filters: FilterState
  readonly setFilters: (filters: FilterState) => void
  readonly filteredProducts: Product[]
  readonly availableTools: ToolName[]
  readonly brands: string[]
  readonly categories: string[]
  readonly departments: string[]
  readonly loading: boolean
  readonly error: string | null
}

const ProductContext = createContext<ProductContextValue | null>(null)

function matchesSearch(product: Product, search: string): boolean {
  if (!search) return true
  const lower = search.toLowerCase()
  return (
    product.brand.toLowerCase().includes(lower) ||
    product.name.toLowerCase().includes(lower) ||
    product.sku.toLowerCase().includes(lower)
  )
}

function matchesFilter(value: string, filter: string): boolean {
  return !filter || value === filter
}

function sortProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const brandCompare = a.brand.localeCompare(b.brand)
    if (brandCompare !== 0) return brandCompare
    return a.name.localeCompare(b.name)
  })
}

function extractUniqueSorted(products: Product[], key: keyof Product): string[] {
  const values = new Set<string>()
  for (const product of products) {
    const value = product[key]
    if (typeof value === 'string' && value.trim()) {
      values.add(value)
    }
  }
  return [...values].sort()
}

interface ProductProviderProps {
  readonly dataset: DatasetConfig
  readonly children: ReactNode
}

export function ProductProvider({ dataset, children }: ProductProviderProps) {
  const { products, enrichmentsByProduct, loading, error } = useProductData(dataset)
  const { urlSku, urlFilters, setUrlSku, setUrlFilters } = useUrlParams()
  const [selectedSku, setSelectedSkuState] = useState<string | null>(
    () => urlSku,
  )
  const [filters, setFiltersState] = useState<FilterState>(() => urlFilters)
  const lastUrlSelectionRef = useRef<string | null>(urlSku)
  const lastUrlFiltersRef = useRef<string>(JSON.stringify(urlFilters))

  const setSelectedSku = useCallback((sku: string) => {
    setSelectedSkuState(sku)
    lastUrlSelectionRef.current = sku
    setUrlSku(sku)
  }, [setUrlSku])

  const setFilters = useCallback((update: FilterState | Partial<FilterState>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...update }
      const serialized = JSON.stringify(next)
      lastUrlFiltersRef.current = serialized
      setUrlFilters(next)
      return next
    })
  }, [setUrlFilters])

  const sortedProducts = useMemo(() => sortProducts(products), [products])

  const filteredProducts = useMemo(() => {
    const isWithImages = dataset.id === 'with-images'

    return sortedProducts.filter((product) => {
      if (!matchesSearch(product, filters.search)) return false
      if (!matchesFilter(product.brand, filters.brand)) return false
      if (!matchesFilter(product.category, filters.category)) return false
      if (!matchesFilter(product.department, filters.department)) return false

      if (isWithImages && filters.enrichedBy) {
        const enrichments = enrichmentsByProduct.get(product.sku)
        if (!enrichments) return false
        if (filters.enrichedBy === 'all') {
          const toolsForProduct = new Set(enrichments.map((e) => e.tool))
          return TOOL_NAMES.every((t) => toolsForProduct.has(t))
        }
        return enrichments.some((e) => e.tool === filters.enrichedBy)
      }

      if (!isWithImages && filters.confidence) {
        const enrichments = enrichmentsByProduct.get(product.sku)
        if (!enrichments) return false
        return enrichments.some((e) => e.confidenceScore === filters.confidence)
      }

      return true
    })
  }, [sortedProducts, filters, enrichmentsByProduct, dataset.id])

  const availableTools = useMemo<ToolName[]>(() => {
    const toolsWithData = new Set<ToolName>()
    for (const enrichments of enrichmentsByProduct.values()) {
      for (const e of enrichments) {
        toolsWithData.add(e.tool)
      }
    }
    return TOOL_NAMES.filter((t) => toolsWithData.has(t))
  }, [enrichmentsByProduct])

  const brands = useMemo(
    () => extractUniqueSorted(products, 'brand'),
    [products],
  )

  const categories = useMemo(
    () => extractUniqueSorted(products, 'category'),
    [products],
  )

  const departments = useMemo(
    () => extractUniqueSorted(products, 'department'),
    [products],
  )

  useEffect(() => {
    if (urlSku === lastUrlSelectionRef.current) {
      return
    }

    lastUrlSelectionRef.current = urlSku
    setSelectedSkuState(urlSku)
  }, [urlSku])

  useEffect(() => {
    const serializedFilters = JSON.stringify(urlFilters)
    if (serializedFilters === lastUrlFiltersRef.current) {
      return
    }

    lastUrlFiltersRef.current = serializedFilters
    setFiltersState(urlFilters)
  }, [urlFilters])

  useEffect(() => {
    if (loading) {
      return
    }

    if (filteredProducts.length === 0) {
      if (selectedSku !== null) {
        setSelectedSkuState(null)
        lastUrlSelectionRef.current = null
        setUrlSku(null)
      }
      return
    }

    const nextSelectedSku = selectedSku ?? urlSku
    const isSelectedInFiltered =
      nextSelectedSku !== null &&
      filteredProducts.some((p) => p.sku === nextSelectedSku)

    if (!isSelectedInFiltered) {
      const firstSku = filteredProducts[0].sku
      setSelectedSkuState(firstSku)
      lastUrlSelectionRef.current = firstSku
      setUrlSku(firstSku)
    }
  }, [filteredProducts, loading, selectedSku, setUrlSku, urlSku])

  const value = useMemo<ProductContextValue>(
    () => ({
      datasetId: dataset.id,
      products,
      enrichmentsByProduct,
      selectedSku,
      setSelectedSku,
      filters,
      setFilters,
      filteredProducts,
      availableTools,
      brands,
      categories,
      departments,
      loading,
      error,
    }),
    [
      dataset.id,
      products,
      enrichmentsByProduct,
      selectedSku,
      setSelectedSku,
      filters,
      setFilters,
      filteredProducts,
      availableTools,
      brands,
      categories,
      departments,
      loading,
      error,
    ],
  )

  return (
    <ProductContext.Provider value={value}>{children}</ProductContext.Provider>
  )
}

export function useProducts(): ProductContextValue {
  const context = useContext(ProductContext)
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider')
  }
  return context
}

export const useProductContext = useProducts

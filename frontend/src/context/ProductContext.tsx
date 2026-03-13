import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { useProductData } from '@/hooks/useProductData'
import {
  EMPTY_FILTERS,
  TOOL_NAMES,
  type FilterState,
  type Product,
  type ToolEnrichment,
  type ToolName,
} from '@/types/enrichment'

interface ProductContextValue {
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
  readonly children: ReactNode
}

export function ProductProvider({ children }: ProductProviderProps) {
  const { products, enrichmentsByProduct, loading, error } = useProductData()
  const [selectedSku, setSelectedSkuState] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<FilterState>(EMPTY_FILTERS)

  const setSelectedSku = useCallback((sku: string) => {
    setSelectedSkuState(sku)
  }, [])

  const setFilters = useCallback((newFilters: FilterState) => {
    setFiltersState(newFilters)
  }, [])

  const sortedProducts = useMemo(() => sortProducts(products), [products])

  const filteredProducts = useMemo(() => {
    return sortedProducts.filter(
      (product) =>
        matchesSearch(product, filters.search) &&
        matchesFilter(product.brand, filters.brand) &&
        matchesFilter(product.category, filters.category) &&
        matchesFilter(product.department, filters.department),
    )
  }, [sortedProducts, filters])

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

  // Auto-select first filtered product when selection is null or not in filtered results
  useEffect(() => {
    if (filteredProducts.length === 0) {
      setSelectedSkuState(null)
      return
    }

    const isSelectedInFiltered =
      selectedSku !== null &&
      filteredProducts.some((p) => p.sku === selectedSku)

    if (!isSelectedInFiltered) {
      setSelectedSkuState(filteredProducts[0].sku)
    }
  }, [filteredProducts, selectedSku])

  const value = useMemo<ProductContextValue>(
    () => ({
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

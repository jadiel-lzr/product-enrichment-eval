import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EMPTY_FILTERS, type FilterState } from '@/types/enrichment'

interface UrlParamState {
  readonly urlSku: string | null
  readonly urlFilters: FilterState
  readonly setUrlSku: (sku: string | null) => void
  readonly setUrlFilters: (filters: FilterState) => void
}

function getFilterValue(
  params: URLSearchParams,
  key: keyof FilterState,
): string {
  return params.get(key) ?? EMPTY_FILTERS[key]
}

export function useUrlParams(): UrlParamState {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsString = searchParams.toString()

  const urlSku = searchParams.get('product')

  const urlFilters = useMemo<FilterState>(
    () => ({
      search: getFilterValue(searchParams, 'search'),
      brand: getFilterValue(searchParams, 'brand'),
      category: getFilterValue(searchParams, 'category'),
      department: getFilterValue(searchParams, 'department'),
      enrichedBy: getFilterValue(searchParams, 'enrichedBy'),
    }),
    [searchParamsString],
  )

  const setUrlSku = useCallback(
    (sku: string | null) => {
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams)

          if (sku) {
            nextParams.set('product', sku)
          } else {
            nextParams.delete('product')
          }

          if (nextParams.toString() === currentParams.toString()) {
            return currentParams
          }

          return nextParams
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const setUrlFilters = useCallback(
    (filters: FilterState) => {
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams)

          for (const [key, value] of Object.entries(filters)) {
            if (value) {
              nextParams.set(key, value)
            } else {
              nextParams.delete(key)
            }
          }

          if (nextParams.toString() === currentParams.toString()) {
            return currentParams
          }

          return nextParams
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return {
    urlSku,
    urlFilters,
    setUrlSku,
    setUrlFilters,
  }
}

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

  const urlSku = searchParams.get('product')

  const urlFilters = useMemo<FilterState>(
    () => ({
      search: getFilterValue(searchParams, 'search'),
      brand: getFilterValue(searchParams, 'brand'),
      category: getFilterValue(searchParams, 'category'),
      department: getFilterValue(searchParams, 'department'),
    }),
    [searchParams],
  )

  const setUrlSku = useCallback(
    (sku: string | null) => {
      const nextParams = new URLSearchParams(searchParams)

      if (sku) {
        nextParams.set('product', sku)
      } else {
        nextParams.delete('product')
      }

      if (nextParams.toString() === searchParams.toString()) {
        return
      }

      setSearchParams(nextParams, { replace: false })
    },
    [searchParams, setSearchParams],
  )

  const setUrlFilters = useCallback(
    (filters: FilterState) => {
      const nextParams = new URLSearchParams(searchParams)

      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          nextParams.set(key, value)
        } else {
          nextParams.delete(key)
        }
      }

      if (nextParams.toString() === searchParams.toString()) {
        return
      }

      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return {
    urlSku,
    urlFilters,
    setUrlSku,
    setUrlFilters,
  }
}

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

interface UrlParamState {
  readonly urlSku: string | null
  readonly setUrlSku: (sku: string | null) => void
}

export function useUrlParams(): UrlParamState {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlSku = searchParams.get('product')

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

  return {
    urlSku,
    setUrlSku,
  }
}

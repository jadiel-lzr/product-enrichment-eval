import { useState, useEffect } from 'react'
import { loadAllData, type LoadedData } from '@/lib/csv-loader'
import type { Product, ToolEnrichment } from '@/types/enrichment'

interface ProductDataState {
  readonly products: Product[]
  readonly enrichmentsByProduct: Map<string, ToolEnrichment[]>
  readonly loading: boolean
  readonly error: string | null
}

const INITIAL_STATE: ProductDataState = {
  products: [],
  enrichmentsByProduct: new Map(),
  loading: true,
  error: null,
}

export function useProductData(): ProductDataState {
  const [state, setState] = useState<ProductDataState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data: LoadedData = await loadAllData()
        if (cancelled) return

        setState({
          products: data.products,
          enrichmentsByProduct: data.enrichments,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setState({
          products: [],
          enrichmentsByProduct: new Map(),
          loading: false,
          error: message,
        })
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

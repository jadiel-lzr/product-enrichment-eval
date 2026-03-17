import { useState, useEffect } from 'react'
import { loadAllData, type LoadedData } from '@/lib/csv-loader'
import type { Product, ToolEnrichment } from '@/types/enrichment'
import type { DatasetConfig } from '@/types/dataset'

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

export function useProductData(config: DatasetConfig): ProductDataState {
  const [state, setState] = useState<ProductDataState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false
    setState(INITIAL_STATE)

    async function load() {
      try {
        const data: LoadedData = await loadAllData(config)
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
  }, [config.id])

  return state
}

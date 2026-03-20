import { useMemo } from 'react'
import { useProductContext } from '@/context/ProductContext'
import {
  CORE_ENRICHMENT_FIELDS,
  FIELD_LABELS,
  type CoreEnrichmentField,
  type ToolEnrichment,
} from '@/types/enrichment'

// --- Types ---

export interface FunnelStep {
  readonly label: string
  readonly count: number
  readonly percent: number
}

export interface ConfidenceBreakdown {
  readonly level: 'high' | 'medium' | 'none'
  readonly count: number
  readonly percent: number
}

export interface FieldFillRate {
  readonly field: CoreEnrichmentField
  readonly label: string
  readonly filled: number
  readonly total: number
  readonly rate: number
}

export interface NoImgAnalysisStats {
  readonly totalProducts: number
  readonly filteredProducts: number
  readonly filterSummary: string

  readonly funnel: readonly FunnelStep[]

  readonly urlDiscovery: {
    readonly withSourceUrl: number
    readonly withoutSourceUrl: number
    readonly confidenceBreakdown: readonly ConfidenceBreakdown[]
  }

  readonly imageQuality: {
    readonly withImages: number
    readonly withoutImages: number
    readonly withFlaggedImages: number
    readonly allFlagged: number
    readonly scoreDistribution: readonly { readonly bucket: string; readonly count: number }[]
    readonly averageConfidence: number | null
  }

  readonly enrichmentCoverage: {
    readonly successCount: number
    readonly partialCount: number
    readonly failedCount: number
    readonly notEnrichedCount: number
    readonly overallFillRate: number
    readonly fieldRates: readonly FieldFillRate[]
  }

  readonly accuracy: {
    readonly average: number | null
    readonly distribution: readonly { readonly bucket: string; readonly count: number }[]
    readonly count: number
  }
}

// --- Helpers ---

function formatFilterSummary(filters: Record<string, string>): string {
  const active = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (active.length === 0) {
    return 'All products'
  }
  return active
    .map(([key, value]) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1)
      return `${label}: ${value}`
    })
    .join(' | ')
}

function safePercent(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return numerator / denominator
}

function hasUnflaggedImage(enrichment: ToolEnrichment): boolean {
  const links = enrichment.imageLinks
  if (!links || links.length === 0) return false
  const flags = enrichment.imageFlags
  if (!flags || flags.length === 0) return true
  const flaggedUrls = new Set(flags.map((f) => f.url))
  return links.some((url) => !flaggedUrls.has(url))
}

function normalizeConfidence(value: string | undefined): 'high' | 'medium' | 'none' {
  if (value === 'high') return 'high'
  if (value === 'medium') return 'medium'
  return 'none'
}

function buildScoreBuckets(
  values: readonly number[],
  buckets: readonly string[],
  ranges: readonly [number, number][],
): readonly { readonly bucket: string; readonly count: number }[] {
  const counts = new Map<string, number>()
  for (const b of buckets) {
    counts.set(b, 0)
  }
  for (const v of values) {
    for (let i = 0; i < ranges.length; i++) {
      const [min, max] = ranges[i]
      if (v >= min && v <= max) {
        counts.set(buckets[i], (counts.get(buckets[i]) ?? 0) + 1)
        break
      }
    }
  }
  return buckets.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }))
}

const IMAGE_CONFIDENCE_BUCKETS = ['9-10', '7-8', '5-6', '3-4', '0-2'] as const
const IMAGE_CONFIDENCE_RANGES: readonly [number, number][] = [
  [9, 10], [7, 8], [5, 6], [3, 4], [0, 2],
]

const ACCURACY_BUCKETS = ['9-10', '7-8', '5-6', '3-4', '1-2'] as const
const ACCURACY_RANGES: readonly [number, number][] = [
  [9, 10], [7, 8], [5, 6], [3, 4], [1, 2],
]

// --- Hook ---

export function useNoImgAnalysis(): NoImgAnalysisStats {
  const {
    products,
    filteredProducts,
    enrichmentsByProduct,
    filters,
  } = useProductContext()

  return useMemo(() => {
    const totalProducts = products.length
    const filteredCount = filteredProducts.length

    const filterSummary = formatFilterSummary({
      search: filters.search,
      brand: filters.brand,
      category: filters.category,
      department: filters.department,
      confidence: filters.confidence,
      imageConfidence: filters.imageConfidence,
      sourceUrlFound: filters.sourceUrlFound,
      imageLinksFound: filters.imageLinksFound,
    })

    // Collect enrichments for each filtered product (take first entry)
    const enrichments: (ToolEnrichment | undefined)[] = filteredProducts.map(
      (p) => enrichmentsByProduct.get(p.sku)?.[0],
    )

    // --- Funnel ---
    const withSourceUrl = enrichments.filter((e) => e?.sourceUrl).length
    const withImages = enrichments.filter(
      (e) => e?.imageLinks && e.imageLinks.length > 0,
    ).length
    const withUnflaggedImages = enrichments.filter(
      (e) => e !== undefined && hasUnflaggedImage(e),
    ).length
    const enrichedCount = enrichments.filter(
      (e) => e?.status === 'success' || e?.status === 'partial',
    ).length

    const funnel: FunnelStep[] = [
      { label: 'Total Products', count: filteredCount, percent: safePercent(filteredCount, filteredCount) },
      { label: 'Source URL Found', count: withSourceUrl, percent: safePercent(withSourceUrl, filteredCount) },
      { label: 'Has Images', count: withImages, percent: safePercent(withImages, filteredCount) },
      { label: 'Enriched', count: enrichedCount, percent: safePercent(enrichedCount, filteredCount) },
    ]

    // --- URL Discovery ---
    const withoutSourceUrl = filteredCount - withSourceUrl
    const confidenceCounts: Record<'high' | 'medium' | 'none', number> = {
      high: 0,
      medium: 0,
      none: 0,
    }
    for (const e of enrichments) {
      const level = normalizeConfidence(e?.confidenceScore)
      confidenceCounts[level]++
    }
    const confidenceBreakdown: ConfidenceBreakdown[] = (
      ['high', 'medium', 'none'] as const
    ).map((level) => ({
      level,
      count: confidenceCounts[level],
      percent: safePercent(confidenceCounts[level], filteredCount),
    }))

    // --- Image Quality ---
    const withoutImages = filteredCount - withImages
    const withFlaggedImages = enrichments.filter(
      (e) => e?.imageFlags && e.imageFlags.length > 0,
    ).length
    const allFlagged = enrichments.filter((e) => {
      if (!e?.imageLinks || e.imageLinks.length === 0) return false
      if (!e.imageFlags || e.imageFlags.length === 0) return false
      return e.imageFlags.length >= e.imageLinks.length
    }).length

    const imageConfidenceValues = enrichments
      .map((e) => e?.imageConfidence)
      .filter((v): v is number => typeof v === 'number')

    const scoreDistribution = buildScoreBuckets(
      imageConfidenceValues,
      [...IMAGE_CONFIDENCE_BUCKETS],
      IMAGE_CONFIDENCE_RANGES,
    )

    const averageConfidence =
      imageConfidenceValues.length > 0
        ? Math.round(
            (imageConfidenceValues.reduce((sum, v) => sum + v, 0) /
              imageConfidenceValues.length) *
              10,
          ) / 10
        : null

    // --- Enrichment Coverage ---
    let successCount = 0
    let partialCount = 0
    let failedCount = 0
    let notEnrichedCount = 0
    let totalFieldsEnriched = 0
    let totalFieldsTotal = 0

    for (const e of enrichments) {
      if (!e) {
        notEnrichedCount++
        continue
      }
      if (e.status === 'success') successCount++
      else if (e.status === 'partial') partialCount++
      else failedCount++

      totalFieldsEnriched += e.fieldsEnriched
      totalFieldsTotal += e.totalFields
    }

    const overallFillRate = safeRate(totalFieldsEnriched, totalFieldsTotal)

    const fieldRates: FieldFillRate[] = CORE_ENRICHMENT_FIELDS.map((field) => {
      let filled = 0
      let total = 0
      for (const e of enrichments) {
        if (!e) continue
        total++
        const value = e.enrichedValues[field]
        if (value && value.trim() !== '') {
          filled++
        }
      }
      return {
        field,
        label: FIELD_LABELS[field],
        filled,
        total,
        rate: safeRate(filled, total),
      }
    }).sort((a, b) => b.rate - a.rate)

    // --- Accuracy ---
    const accuracyValues = enrichments
      .map((e) => e?.accuracyScore)
      .filter((v): v is number => typeof v === 'number' && v > 0)

    const accuracyAverage =
      accuracyValues.length > 0
        ? Math.round(
            (accuracyValues.reduce((sum, v) => sum + v, 0) /
              accuracyValues.length) *
              10,
          ) / 10
        : null

    const accuracyDistribution = buildScoreBuckets(
      accuracyValues,
      [...ACCURACY_BUCKETS],
      ACCURACY_RANGES,
    )

    return {
      totalProducts,
      filteredProducts: filteredCount,
      filterSummary,
      funnel,
      urlDiscovery: {
        withSourceUrl,
        withoutSourceUrl,
        confidenceBreakdown,
      },
      imageQuality: {
        withImages,
        withoutImages,
        withFlaggedImages,
        allFlagged,
        scoreDistribution,
        averageConfidence,
      },
      enrichmentCoverage: {
        successCount,
        partialCount,
        failedCount,
        notEnrichedCount,
        overallFillRate,
        fieldRates,
      },
      accuracy: {
        average: accuracyAverage,
        distribution: accuracyDistribution,
        count: accuracyValues.length,
      },
    }
  }, [products, filteredProducts, enrichmentsByProduct, filters])
}

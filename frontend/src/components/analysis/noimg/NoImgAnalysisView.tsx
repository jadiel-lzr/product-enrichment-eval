import { useNoImgAnalysis } from '@/hooks/useNoImgAnalysis'
import { AnalysisEmptyState } from '../AnalysisEmptyState'
import { PipelineFunnel } from './PipelineFunnel'
import { UrlDiscoveryStats } from './UrlDiscoveryStats'
import { ImageQualityStats } from './ImageQualityStats'
import { EnrichmentCoverage } from './EnrichmentCoverage'
import { AccuracyDistribution } from './AccuracyDistribution'

export function NoImgAnalysisView() {
  const stats = useNoImgAnalysis()

  if (stats.filteredProducts === 0) {
    return <AnalysisEmptyState variant="no-products" />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 md:p-6">
        <section className="rounded-3xl border border-gray-200 bg-gray-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
                Analysis Mode
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Pipeline Quality Analysis
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
                Evaluating enrichment pipeline health across {stats.filteredProducts} of{' '}
                {stats.totalProducts} products
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-200">
              <div className="font-medium text-white">Active filters</div>
              <div className="mt-1">{stats.filterSummary}</div>
            </div>
          </div>
        </section>

        <PipelineFunnel steps={stats.funnel} />
        <UrlDiscoveryStats stats={stats.urlDiscovery} totalProducts={stats.filteredProducts} />
        <ImageQualityStats stats={stats.imageQuality} totalProducts={stats.filteredProducts} />
        <EnrichmentCoverage stats={stats.enrichmentCoverage} totalProducts={stats.filteredProducts} />
        <AccuracyDistribution stats={stats.accuracy} />
      </div>
    </div>
  )
}

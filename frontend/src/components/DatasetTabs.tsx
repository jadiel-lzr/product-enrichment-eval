import { DATASET_CONFIGS, type DatasetId } from '@/types/dataset'

const DATASETS = Object.values(DATASET_CONFIGS)

interface DatasetTabsProps {
  readonly activeDataset: DatasetId
  readonly onChange: (dataset: DatasetId) => void
}

export function DatasetTabs({ activeDataset, onChange }: DatasetTabsProps) {
  return (
    <nav className="flex gap-6 border-b border-gray-200 bg-white px-6">
      {DATASETS.map((config) => {
        const active = config.id === activeDataset

        return (
          <button
            key={config.id}
            type="button"
            onClick={() => onChange(config.id)}
            className={`relative py-2.5 text-sm font-medium transition ${
              active
                ? 'text-gray-900'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {config.label}
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gray-900" />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

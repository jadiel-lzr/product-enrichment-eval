export type DatasetId = 'with-images' | 'without-images'

export interface DatasetConfig {
  readonly id: DatasetId
  readonly label: string
  readonly baseCsvPath: string
  readonly enrichedCsvPrefix: string
  readonly normalizeRow?: (raw: Record<string, string>) => Record<string, string>
  readonly normalizeEnrichedRow?: (raw: Record<string, string>) => Record<string, string>
}

/**
 * Maps base-missing-images.csv rows to the ProductSchema shape.
 * The missing-images CSV uses `product_name` instead of `name` and lacks
 * many columns that ProductSchema requires.
 */
/**
 * Maps base-missing-images.csv column names to ProductSchema shape.
 * Also copies description → description_eng and materials_original → materials
 * so the UI can display original values under the enrichment field names.
 */
function normalizeNoImageRow(
  raw: Record<string, string>,
): Record<string, string> {
  return {
    ...raw,
    name: raw['product_name'] ?? raw['name'] ?? '',
    price: raw['price'] ?? '0',
    sizes: raw['sizes'] ?? '[]',
    product_id: raw['product_id'] ?? '',
    season_year: raw['season_year'] ?? '',
    color_original: raw['color_original'] ?? '',
    made_in_original: raw['made_in_original'] ?? '',
    category_original: raw['category_original'] ?? '',
    materials_original: raw['materials_original'] ?? raw['materials'] ?? '',
    materials: raw['materials'] ?? raw['materials_original'] ?? '',
    unit_system_name_original: raw['unit_system_name_original'] ?? '',
    collection: raw['collection'] ?? '',
    dimensions: raw['dimensions'] ?? '',
    collection_original: raw['collection_original'] ?? '',
    title: raw['title'] ?? '',
    sizes_raw: raw['sizes_raw'] ?? '',
    season_raw: raw['season_raw'] ?? '',
    description: raw['description'] ?? raw['description_eng'] ?? '',
    description_eng: raw['description_eng'] ?? raw['description'] ?? '',
    size_system: raw['size_system'] ?? '',
    category_item: raw['category_item'] ?? '',
    season_display: raw['season_display'] ?? '',
    sizes_original: raw['sizes_original'] ?? '',
    vendor_product_id: raw['vendor_product_id'] ?? '',
  }
}

/**
 * Maps enriched-noimg CSV column names to the enrichment field names.
 * The no-image enriched CSV uses 'description' instead of 'description_eng'
 * and 'materials_original' instead of 'materials'.
 */
function normalizeNoImageEnrichedRow(
  raw: Record<string, string>,
): Record<string, string> {
  return {
    ...raw,
    description_eng: raw['description_eng'] ?? raw['description'] ?? '',
    materials: raw['materials'] ?? raw['materials_original'] ?? '',
  }
}

export const DATASET_CONFIGS: Record<DatasetId, DatasetConfig> = {
  'with-images': {
    id: 'with-images',
    label: 'Products with Images',
    baseCsvPath: '/data/base.csv',
    enrichedCsvPrefix: 'enriched',
  },
  'without-images': {
    id: 'without-images',
    label: 'Products without Images',
    baseCsvPath: '/data/base-missing-images.csv',
    enrichedCsvPrefix: 'enriched-noimg',
    normalizeRow: normalizeNoImageRow,
    normalizeEnrichedRow: normalizeNoImageEnrichedRow,
  },
}

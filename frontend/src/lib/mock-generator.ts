import type { Product } from '@/types/enrichment'
import { CORE_ENRICHMENT_FIELDS, type ToolName } from '@/types/enrichment'

const MOCK_DESCRIPTIONS = [
  'Elegant luxury item crafted with premium materials for the discerning customer.',
  'Contemporary design meets classic craftsmanship in this standout piece.',
  'A versatile addition to any wardrobe, combining style and comfort.',
  'Premium quality construction with attention to every detail.',
  'Sophisticated silhouette with modern proportions and refined finish.',
  'Timeless design featuring the brand signature aesthetic and quality.',
  'Crafted from the finest materials with impeccable attention to detail.',
  'An iconic piece that balances form and function effortlessly.',
]

const MOCK_SEASONS = [
  'FW24', 'SS24', 'FW23', 'SS23', 'FW25', 'SS25',
  'Pre-Fall 2024', 'Resort 2024', 'Cruise 2025',
]

const MOCK_YEARS = ['2023', '2024', '2025']

const MOCK_COLLECTIONS = [
  'Main Collection', 'Capsule', 'Limited Edition', 'Essentials',
  'Heritage', 'Contemporary', 'Sport', 'Atelier',
]

const MOCK_DIMENSIONS = [
  '30x20x10 cm', '25x15x8 cm', '40x30x15 cm', '35x25x12 cm',
  '20x15x5 cm', '45x35x20 cm',
]

const MOCK_MATERIALS = [
  'Calf Leather', '100% Cotton', 'Nylon / Polyester blend',
  'Lamb Skin', 'Canvas with leather trim', 'Silk',
]

const MOCK_WEIGHTS = [
  '350g', '500g', '1.2kg', '250g', '800g', '150g',
]

const MOCK_MADE_IN = [
  'Italy', 'France', 'Spain', 'Portugal', 'Germany', 'Japan',
]

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function randomGtin(): string {
  const digits = Array.from({ length: 13 }, () =>
    Math.floor(Math.random() * 10),
  ).join('')
  return digits
}

function generateFieldValue(field: string, product: Product): string {
  switch (field) {
    case 'description_eng':
      return pickRandom(MOCK_DESCRIPTIONS)
    case 'season':
      return pickRandom(MOCK_SEASONS)
    case 'year':
      return pickRandom(MOCK_YEARS)
    case 'collection':
      return `${product.brand} ${pickRandom(MOCK_COLLECTIONS)}`
    case 'gtin':
      return randomGtin()
    case 'dimensions':
      return pickRandom(MOCK_DIMENSIONS)
    case 'made_in':
      return pickRandom(MOCK_MADE_IN)
    case 'materials':
      return pickRandom(MOCK_MATERIALS)
    case 'weight':
      return pickRandom(MOCK_WEIGHTS)
    default:
      return ''
  }
}

interface MockRow {
  readonly [key: string]: string
}

function generateMockRow(product: Product, tool: ToolName): MockRow {
  const statusRoll = Math.random()
  const status =
    statusRoll < 0.85 ? 'success' : statusRoll < 0.95 ? 'partial' : 'failed'

  const fillRate = status === 'failed'
    ? 0
    : status === 'partial'
      ? 0.3 + Math.random() * 0.3
      : 0.6 + Math.random() * 0.3

  const enrichedFields: Record<string, string> = {}
  const fieldsToFill: string[] = []

  for (const field of CORE_ENRICHMENT_FIELDS) {
    if (Math.random() < fillRate) {
      fieldsToFill.push(field)
    }
  }

  for (const field of fieldsToFill) {
    enrichedFields[field] = generateFieldValue(field, product)
  }

  const baseRow: Record<string, string> = {
    sku: product.sku,
    code: product.code,
    name: product.name,
    brand: product.brand,
    category: product.category,
    department: product.department,
    price: String(product.price),
    product_id: product.product_id,
  }

  for (const field of CORE_ENRICHMENT_FIELDS) {
    baseRow[field] = enrichedFields[field] ?? ''
  }

  const accuracyScore =
    status === 'success' ? String(Math.floor(50 + Math.random() * 45)) : ''

  return {
    ...baseRow,
    _enrichment_tool: tool,
    _enrichment_status: status,
    _enrichment_error: status === 'failed' ? 'Mock enrichment failure' : '',
    _enriched_fields: fieldsToFill.join(','),
    _accuracy_score: accuracyScore,
  }
}

export function generateMockEnrichedRows(
  products: readonly Product[],
  tool: ToolName,
): MockRow[] {
  return products.map((product) => generateMockRow(product, tool))
}

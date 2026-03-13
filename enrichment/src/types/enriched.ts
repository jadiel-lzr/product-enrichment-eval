import { z } from 'zod'

export const ENRICHMENT_TARGET_FIELDS = [
  'description_eng',
  'season',
  'year',
  'collection',
  'gtin',
  'dimensions',
  'made_in',
  'materials',
  'weight',
] as const

export const EnrichedFieldsSchema = z
  .object({
    description_eng: z.string().optional(),
    season: z.string().optional(),
    year: z.string().optional(),
    collection: z.string().optional(),
    gtin: z.string().optional(),
    dimensions: z.string().optional(),
    made_in: z.string().optional(),
    materials: z.string().optional(),
    weight: z.string().optional(),
    accuracy_score: z.number().int().min(1).max(10).optional(),
  })
  .passthrough()

export type EnrichedFields = z.infer<typeof EnrichedFieldsSchema>

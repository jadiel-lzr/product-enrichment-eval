import { z } from 'zod'

export const EnrichedFieldsSchema = z
  .object({
    description_eng: z.string().optional(),
    season: z.string().optional(),
    year: z.string().optional(),
    collection: z.string().optional(),
    gtin: z.string().optional(),
    dimensions: z.string().optional(),
  })
  .strict()

export type EnrichedFields = z.infer<typeof EnrichedFieldsSchema>

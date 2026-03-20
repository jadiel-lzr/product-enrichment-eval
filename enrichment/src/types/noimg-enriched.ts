import { z } from 'zod'

// Standalone schema without .passthrough() — keeps JSON schema simple enough
// for Anthropic's web_search tool compatibility
export const NoImgEnrichedFieldsSchema = z.object({
  title: z.string().optional(),
  description_eng: z.string().optional(),
  season: z.string().optional(),
  year: z.string().optional(),
  collection: z.string().optional(),
  gtin: z.string().optional(),
  dimensions: z.string().optional(),
  made_in: z.string().optional(),
  materials: z.string().optional(),
  weight: z.string().optional(),
  color: z.string().optional(),
  additional_info: z.string().optional(),
  accuracy_score: z.number().int().min(1).max(10).optional(),
  image_links: z.string().optional(),
  confidence_score: z.enum(['high', 'medium', 'low', 'none']).optional(),
  source_url: z.string().optional(),
  match_reason: z.string().optional(),
  image_confidence: z.enum(['verified', 'variant_uncertain', 'unverified']).optional(),
  image_flags: z.string().optional(),
})

export type NoImgEnrichedFields = z.infer<typeof NoImgEnrichedFieldsSchema>

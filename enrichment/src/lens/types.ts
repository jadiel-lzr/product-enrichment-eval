import { z } from 'zod'

export const LensMatchSchema = z.object({
  title: z.string(),
  link: z.string(),
  source: z.string(),
  thumbnail: z.union([z.string(), z.null()]).optional(),
  price: z.union([z.string(), z.number(), z.null()]).optional(),
  rating: z.union([z.number(), z.null()]).optional(),
  reviews: z.union([z.number(), z.null()]).optional(),
})

export type LensMatch = z.infer<typeof LensMatchSchema>

export const STOCK_PHOTO_DOMAINS = [
  'istockphoto.com',
  'gettyimages.com',
  'shutterstock.com',
  'alamy.com',
  'depositphotos.com',
  'dreamstime.com',
  '123rf.com',
] as const

export const MAX_LENS_SCRAPING_URLS = 3
export const MAX_LENS_CONTEXT_LINES = 5

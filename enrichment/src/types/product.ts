import { z } from 'zod'

export const SizeEntrySchema = z.object({
  Qty: z.number(),
  sku: z.string(),
  Size: z.string(),
  Barcode: z.string(),
  Currency: z.string(),
  NetPrice: z.number(),
  BrandReferencePrice: z.number(),
})

export type SizeEntry = z.infer<typeof SizeEntrySchema>

export const ErrorEntrySchema = z.object({
  error: z.string(),
  field: z.string(),
})

export type ErrorEntry = z.infer<typeof ErrorEntrySchema>

export const ProductSchema = z
  .object({
    sku: z.string(),
    code: z.string(),
    gtin: z.array(z.string()),
    name: z.string(),
    brand: z.string(),
    color: z.string(),
    model: z.string(),
    price: z.coerce.number(),
    sizes: z.array(SizeEntrySchema),
    errors: z.array(ErrorEntrySchema),
    images: z.array(z.string()),
    season: z.string(),
    made_in: z.string(),
    category: z.string(),
    feed_name: z.string(),
    department: z.string(),
    product_id: z.string(),
    season_year: z.string(),
    color_original: z.string(),
    made_in_original: z.string(),
    category_original: z.string(),
    materials_original: z.string(),
    department_original: z.string(),
    unit_system_name_original: z.string(),
    year: z.string(),
    collection: z.string(),
    dimensions: z.string(),
    collection_original: z.string(),
    title: z.string(),
    sizes_raw: z.string(),
    season_raw: z.string(),
    description: z.string(),
    size_system: z.string(),
    category_item: z.string(),
    season_display: z.string(),
    sizes_original: z.string(),
    vendor_product_id: z.string(),
    _missing_fields: z.number().optional(),
    _has_images: z.boolean().optional(),
    _image_count: z.number().optional(),
  })
  .passthrough()

export type Product = z.infer<typeof ProductSchema>

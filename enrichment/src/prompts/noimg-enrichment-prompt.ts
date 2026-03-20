import type { Product } from '../types/product.js'
import { buildEnrichmentPrompt } from './enrichment-prompt.js'
import { translateColor, correctBrand } from '../images/search-config.js'

function buildSearchHint(product: Product): string {
  const brand = correctBrand(product.brand)
  const code = product.model || ''
  const name = product.name || ''
  const colorEng = translateColor(product.color_original || product.color)

  return [brand, code, name, colorEng].filter((p) => p.length > 0).join(' ')
}

export function buildNoImgEnrichmentPrompt(product: Product): string {
  const basePrompt = buildEnrichmentPrompt(product)
  const searchHint = buildSearchHint(product)

  const imageSearchSection = `
## Image Search Instructions

This product has NO images in our feed. Use web search to find product images.

Suggested search query: \`${searchHint}\`

If the code/model search doesn't work, try: \`${correctBrand(product.brand)} ${product.name} ${translateColor(product.color_original || product.color)} buy\`

When you find a product page:
1. **Extract the main product image URL** — look for og:image meta tag, JSON-LD "image" field, or the primary product image
2. **Prefer high-resolution images** — look for URLs containing "zoom", "large", "1200", "2000", "w2000"
3. **NEVER fabricate or guess image URLs** — only return URLs you actually found on a page
4. **The source URL must be a specific product page**, NOT a collection or category page

## Additional Output Fields

In addition to the 12 enrichment fields above, also return these image-related fields in your JSON:

- \`image_links\`: Pipe-separated image URLs found on the web. Empty string if none found.
- \`confidence_score\`: "high" (official brand site or major retailer), "medium" (secondary retailer), "low" (uncertain match), "none" (no images found)
- \`source_url\`: The specific product page URL where the image was found. Empty string if none found.
`

  return basePrompt + imageSearchSection
}

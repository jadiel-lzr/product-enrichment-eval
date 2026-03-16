import type { Product } from '../types/product.js'
import { ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'
import { buildLensContextLines } from '../lens/extractor.js'

const FACTUAL_FIELDS = ['title', 'gtin', 'dimensions', 'year', 'weight'] as const
const GENERATIVE_FIELDS = [
  'description_eng',
  'season',
  'collection',
  'materials',
  'made_in',
  'color',
  'additional_info',
] as const

function buildExistingContext(product: Product): string {
  const contextEntries: readonly string[] = [
    product.title ? `- title is currently "${product.title}" -- this may be generic (brand + category), find the actual product name` : '',
    product.season ? `- season is currently "${product.season}" -- confirm or improve` : '',
    product.year ? `- year is currently "${product.year}" -- confirm or improve` : '',
    product.collection ? `- collection is currently "${product.collection}" -- confirm or improve` : '',
    product.made_in ? `- made_in is currently "${product.made_in}" -- confirm or improve` : '',
    product.materials_original ? `- materials are currently "${product.materials_original}" -- confirm or improve` : '',
    product.dimensions ? `- dimensions is currently "${product.dimensions}" -- confirm or improve` : '',
    product.gtin?.length ? `- gtin is currently "${product.gtin.join(', ')}" -- confirm or improve` : '',
    (product.color_original || product.color) ? `- color is currently "${product.color_original || product.color}" -- confirm or improve` : '',
  ].filter((line) => line !== '')

  if (contextEntries.length === 0) {
    return 'No existing field values available.'
  }

  return `Existing field values (confirm or improve):\n${contextEntries.join('\n')}`
}

function buildLensContext(product: Product): string {
  const lines = buildLensContextLines(product)
  if (lines.length === 0) {
    return ''
  }

  return `## Visual Match Context (Google Lens)

The following products were identified as visual matches:
${lines.join('\n')}

Use these to verify or infer: title (actual product name), description, materials, color, made_in, collection, season.

`
}

export function buildEnrichmentPrompt(product: Product): string {
  const existingContext = buildExistingContext(product)
  const lensContext = buildLensContext(product)

  return `You are a luxury product data specialist. Enrich the following product with accurate, high-quality data.

## Product Identity

- **Brand:** ${product.brand}
- **Name:** ${product.name}
- **Model:** ${product.model}
- **Color:** ${product.color}
- **Category:** ${product.category}
- **Department:** ${product.department}

## ${existingContext}

${lensContext}## Target Fields

Fill each of the following 12 fields. Return a JSON object with exactly these keys:

${ENRICHMENT_TARGET_FIELDS.map((f) => `- \`${f}\``).join('\n')}
- \`accuracy_score\` (integer 1-10): your overall confidence in this enrichment

## Confidence Strategy

**Factual fields (${FACTUAL_FIELDS.join(', ')}):** These require verifiable data. If you are uncertain about the correct value, leave the field blank (empty string). Wrong data is worse than missing data.

**Generative fields (${GENERATIVE_FIELDS.join(', ')}):** Always attempt to fill these fields, even with moderate confidence. Use context clues from the product identity, images, and existing values.

## Title Guidelines

Write \`title\` as the actual product name, not a generic "Brand + Category" label. Include the model name, style name, and key identifying details. Generic titles hurt SEO and get flagged as duplicates by search engines.

Bad: "Acne Skirts"
Good: "Macaria Distressed Denim Miniskirt"

Use the product identity, images, and visual match context to find the real product name. If you cannot determine the specific product name with confidence, leave it blank.

## Description Guidelines

Write \`description_eng\` as a factual product summary, 2-3 sentences. Include only verifiable details present in the product data, images, or visual match context: materials, construction, design features, intended use. Do not invent attributes, marketing claims, or subjective descriptions. Avoid superlatives and lifestyle language.

Bad: "Perfect for a Scandinavian aesthetic, this exquisite piece elevates any wardrobe."
Good: "Constructed from 100% wool felt with a grosgrain ribbon trim. Features a wide brim and packable silhouette."

## Color Guidelines

Write \`color\` as a clean, human-readable color name. Normalize abbreviations and codes (e.g. "BLK" → "Black", "NVY BLU" → "Navy Blue"). Use the product images to verify and refine the color when available.

## Additional Info Guidelines

Write \`additional_info\` as a concise summary of supplementary product details not captured by other fields. Include care instructions, notable design features, functional attributes, or construction details when available. 1-2 sentences, factual tone. Leave blank if no meaningful additional context can be inferred.

## Output Format

Return ONLY a valid JSON object with the 12 target fields plus \`accuracy_score\` (integer 1-10). No markdown, no explanation, no wrapping.

Example structure:
\`\`\`json
{
  "title": "...",
  "description_eng": "...",
  "season": "...",
  "year": "...",
  "collection": "...",
  "gtin": "...",
  "dimensions": "...",
  "made_in": "...",
  "materials": "...",
  "weight": "...",
  "color": "...",
  "additional_info": "...",
  "accuracy_score": 7
}
\`\`\`
`
}

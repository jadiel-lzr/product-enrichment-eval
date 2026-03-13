import type { Product } from '../types/product.js'
import { ENRICHMENT_TARGET_FIELDS } from '../types/enriched.js'

const FACTUAL_FIELDS = ['gtin', 'dimensions', 'year', 'weight'] as const
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

export function buildEnrichmentPrompt(product: Product): string {
  const existingContext = buildExistingContext(product)

  return `You are a luxury product data specialist. Enrich the following product with accurate, high-quality data.

## Product Identity

- **Brand:** ${product.brand}
- **Name:** ${product.name}
- **Model:** ${product.model}
- **Color:** ${product.color}
- **Category:** ${product.category}
- **Department:** ${product.department}

## ${existingContext}

## Target Fields

Fill each of the following 11 fields. Return a JSON object with exactly these keys:

${ENRICHMENT_TARGET_FIELDS.map((f) => `- \`${f}\``).join('\n')}
- \`accuracy_score\` (integer 1-10): your overall confidence in this enrichment

## Confidence Strategy

**Factual fields (${FACTUAL_FIELDS.join(', ')}):** These require verifiable data. If you are uncertain about the correct value, leave the field blank (empty string). Wrong data is worse than missing data.

**Generative fields (${GENERATIVE_FIELDS.join(', ')}):** Always attempt to fill these fields, even with moderate confidence. Use context clues from the product identity, images, and existing values.

## Description Tone

Write \`description_eng\` as luxury e-commerce copy, 2-3 sentences, professional style (think NET-A-PORTER / SSENSE -- concise, elegant, highlights materials and design).

## Color Guidelines

Write \`color\` as a clean, human-readable color name. Normalize abbreviations and codes (e.g. "BLK" → "Black", "NVY BLU" → "Navy Blue"). Use the product images to verify and refine the color when available.

## Additional Info Guidelines

Write \`additional_info\` as a concise summary of supplementary product details not captured by other fields. Include care instructions, notable design features, functional attributes, or construction details when available. 1-2 sentences, factual tone. Leave blank if no meaningful additional context can be inferred.

## Output Format

Return ONLY a valid JSON object with the 11 target fields plus \`accuracy_score\` (integer 1-10). No markdown, no explanation, no wrapping.

Example structure:
\`\`\`json
{
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

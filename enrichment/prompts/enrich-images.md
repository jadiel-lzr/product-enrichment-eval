# Image Enrichment Prompt

Run this as a prompt in Claude Code to enrich products with verified image URLs.

---

Read the file `frontend/public/data/base-missing-images.csv` and pick 20 random products. Prioritize a mix of brands from the high-findability tier first, then medium, then include a few low-findability to test.

## Brand Findability Tiers

- **High** (style code search works): Etro, Dolce & Gabbana, Khaite, Palm Angels, Mini Rodini, Off-White, Alexander McQueen, Courrèges, Versace, Dsquared2, Rabanne
- **Medium** (brand + name works, code may not match): Frame, Lamberto Losani, Ermanno Scervino, Glanshirt, Jil Sander, Zanone (via slowear.com), Alberta Ferretti
- **Low/none** (niche, no online retail): Antonino Valenti, DESA, Brando-Lubiam, CB Made in Italy, Finamore, Blancha, Myths, Salvatore Santoro

## Italian Color Translations

Colors in the feed are sometimes in Italian. Translate when searching:
NERO=black, BIANCO=white, ROSSO=red, VERDE=green, AZZURRO=light blue, BLU=blue, GRIGIO=grey, BEIGE=beige, ORO=gold, AVORIO=ivory, MARRONE=brown

## Enrichment Strategy (in priority order)

For each product, try these sources IN ORDER until you find images:

### Step 1: Check the feed supplier's own site first (highest ROI)

Each product has a `feed_name` column indicating its supplier. The supplier likely has a retail website with product images. Try searching their site first:

- `feed_name=loschi` → search `site:loschiboutique.com {sku}` or try `https://loschiboutique.com/en/product/{name-slugified}-{sku}/`
- For any other feed_name, try WebSearch: `site:{feed_name}.com {sku}` or `{feed_name} {brand} {code} {name}` to discover if the supplier has a website with product images

### Step 2: Brand-direct sites with known CDN patterns

For these brands, try constructing URLs from known patterns AND verifying via WebFetch:

- **Etro**: Search `site:etro.com {code}`, then WebFetch the product page. CDN pattern: `https://content.etro.com/Adaptations/420/{code}_SF_01.jpg`
- **Dolce & Gabbana**: Search `site:dolcegabbana.com {code}`, WebFetch product page
- **Alexander McQueen**: Search `site:alexandermcqueen.com {code}`, WebFetch product page. Images on Kering CDN: `https://amq-mcq.dam.kering.com/m/{hash}/eCom-{code}_F.jpg`
- **Mini Rodini / Shopify retailers**: Search on luksusbaby.kr, smoochiebaby.com, kidsatelier.com — they use Shopify CDN (`/cdn/shop/files/`)
- **Off-White**: Search on kidsatelier.com, kids21.com, or off---white.com

### Step 3: Major luxury retailers

Search for the product on these retailers and WebFetch the **specific product page** (NOT collection pages):

- farfetch.com, ssense.com, net-a-porter.com, mytheresa.com, matchesfashion.com
- italist.com, thedoublef.com, giglio.com, vitkac.com
- For kids: childrensalon.com, childsplayclothing.com, kidsatelier.com

### Step 4: General web search

Use WebSearch with query: `{brand} "{code}" {name} {color_english}`

If code search fails, try: `{brand} {name} {color_english} buy`

## Image Extraction Rules

When you WebFetch a product page:

1. **Extract og:image** — `<meta property="og:image" content="...">` is most reliable
2. **Check JSON-LD** — Look for `"image"` in structured data
3. **Find main product img** — Look for large product images, not thumbnails
4. **NEVER fabricate URLs** — Only return URLs actually found on the page
5. **Prefer high-res** — Look for "zoom", "large", "1200", "2000", "w2000" in URLs
6. **Source URL must be product-level** — Link to the specific product page, NOT a collection/category page

## Metadata Enrichment

Use the same enrichment approach as the "with-images" dataset. For each product found, also enrich:

**Factual fields** (only if verifiable — leave blank if uncertain): title, gtin, dimensions, year, weight

**Generative fields** (always attempt): description_eng, season, collection, materials, made_in, color, additional_info

### Title Guidelines
Write `title` as the actual product name, not generic "Brand + Category". Include model name, style name, key details.
- Bad: "Acne Skirts"
- Good: "Macaria Distressed Denim Miniskirt"

### Description Guidelines
Factual product summary, 2-3 sentences. Only verifiable details. No marketing language.

### Color Guidelines
Normalize to clean English: "NERO" → "Black", "BLU" → "Blue", "BIANCO/ORO" → "White/Gold"

## Output Format

Write the CSV to `frontend/public/data/enriched-noimg-claude.csv`.

**CRITICAL: Preserve all original base CSV columns.** For each product:
1. Copy ALL column values from the base CSV row
2. Overlay enriched fields on top (title, description_eng, materials, etc.)
3. Add enrichment columns: image_links, confidence_score, source_url, _enrichment_tool, _enrichment_status, _enrichment_fill_rate, _enriched_fields, _enrichment_error, _enrichment_accuracy_score

Columns:
```
sku,code,gtin,name,brand,color,model,price,sizes,errors,images,season,made_in,category,feed_name,department,product_id,season_year,color_original,made_in_original,category_original,materials_original,department_original,unit_system_name_original,year,collection,dimensions,collection_original,title,sizes_raw,season_raw,description,size_system,category_item,season_display,sizes_original,vendor_product_id,lens_all_matches,lens_brand_matches,description_eng,materials,weight,additional_info,accuracy_score,image_links,confidence_score,source_url,_enrichment_tool,_enrichment_status,_enrichment_fill_rate,_enriched_fields,_enrichment_error,_enrichment_accuracy_score
```

Set `_enrichment_tool` to `claude` for all rows.

- `image_links`: Verified image URL(s), pipe-separated if multiple. Empty if not found.
- `confidence_score`: "high" (verified from official/major retailer), "medium" (secondary retailer), "low" (uncertain match), "none" (not found)
- `source_url`: The **specific product page URL** where the image was found. NEVER a collection page.
- `_enrichment_accuracy_score`: 1-10 confidence in the overall enrichment

## Data Quality Notes

- "BURBURRY" in the feed = Burberry (typo). Search as "Burberry" instead.
- Products named "Unknown" — use brand + code + category for search.
- Products come from different feed suppliers (loschi, bedin, breficom, indicevision_v2, etc.). Always use the `feed_name` value as a search hint — try `site:{feed_name}.com {sku}` to check if the supplier has a website with the product.

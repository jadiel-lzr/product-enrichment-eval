# Image Enrichment Prompt

Run this as a prompt in Claude Code to enrich products with verified image URLs.

---

Read the file `frontend/public/data/base-missing-images.csv` and pick 20 random products (use a mix of brands — prioritize brands with high online findability like Etro, Dolce & Gabbana, Alexander McQueen, Khaite, Palm Angels, Off-White, Mini Rodini, Courrèges, Frame, Versace, Dsquared2, Rabanne, Jil Sander).

For each product, do the following:

1. **Search** for the product using WebSearch with query: `{brand} {code} {name} {color}` (use the style code from the `code` column, not the SKU).

2. **Visit the best matching product page** using WebFetch. Prioritize:
   - Official brand websites (etro.com, dolcegabbana.com, alexandermcqueen.com, off---white.com, minirodini.com, khaite.com)
   - Major retailers (farfetch.com, ssense.com, net-a-porter.com, mytheresa.com, matchesfashion.com)
   - Other retailers that carry the specific product

3. **Extract the actual image URL** from the fetched page. Look for:
   - `<meta property="og:image" content="...">` tag (most reliable)
   - `<img>` tags with the product image (look for the main product image, not thumbnails or icons)
   - JSON-LD structured data with `image` field
   - Do NOT guess or construct URLs. Only return URLs you actually found on the page.

4. **If the first search doesn't work**, try alternate queries:
   - `{brand} "{code}" site:{brand-domain}`
   - `{name} {brand} {color} buy`
   - `{code} {brand}`

5. **Record the results** for each product. Start with ALL original columns from the base CSV row, then add/overwrite the enrichment columns:
   - `image_links`: The actual verified image URL(s), pipe-separated if multiple. Leave empty if not found.
   - `source_url`: The product page URL you found the image on.
   - `confidence_score`: "high" if image URL extracted from official/major retailer page, "medium" if from secondary retailer, "low" if uncertain match, "none" if no image found.
   - Enrich metadata fields (title, description_eng, collection, dimensions, materials, weight, additional_info) from what you find on the page. Do NOT overwrite original base values for fields like name, brand, sku, code, color, season, year, made_in, category, feed_name, department — preserve those from the base CSV.

6. **Write the output** as a CSV to `frontend/public/data/enriched-noimg-claude.csv`. The columns should be all the base CSV columns, followed by the enrichment-specific columns:

```
sku,code,gtin,name,brand,color,model,price,sizes,errors,images,season,made_in,category,feed_name,department,product_id,season_year,color_original,made_in_original,category_original,materials_original,department_original,unit_system_name_original,year,collection,dimensions,collection_original,title,sizes_raw,season_raw,description,size_system,category_item,season_display,sizes_original,vendor_product_id,lens_all_matches,lens_brand_matches,description_eng,materials,weight,additional_info,accuracy_score,image_links,confidence_score,source_url,_enrichment_tool,_enrichment_status,_enrichment_fill_rate,_enriched_fields,_enrichment_error,_enrichment_accuracy_score
```

**Preserving original data:** For each of the 20 products, copy ALL column values from the base CSV row into the output row first. Then overlay the enriched fields on top. This means the output CSV has the full product data (name, brand, sku, code, category, feed_name, department, season, year, etc.) plus the enrichment results.

Set `_enrichment_tool` to `claude` for all rows.

**Critical rules:**
- NEVER fabricate image URLs. Only use URLs you actually found via WebFetch.
- If you can't find a working image URL, leave `image_links` empty and still provide the `source_url` if you found the product page.
- Test that image URLs end in an image extension (.jpg, .jpeg, .png, .webp) or come from a known image CDN pattern.
- Prefer high-resolution product images (look for "zoom", "large", "1200", "2000" in URLs).
- PRESERVE all original base CSV values. Do not blank out or modify existing data from the base row.

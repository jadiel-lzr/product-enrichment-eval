# Domain Pitfalls

**Domain:** Product Data Enrichment Evaluation (Fashion/Luxury E-commerce)
**Researched:** 2026-03-13

## Critical Pitfalls

Mistakes that cause rewrites, wasted budget, or fundamentally invalid evaluation results.

---

### Pitfall 1: LLM Hallucination Treated as Enrichment

**What goes wrong:** LLMs (Claude, Gemini) confidently generate plausible-sounding but fabricated product data. A "Prada Dresses Green" product might receive a hallucinated GTIN that belongs to a different product entirely, or a fabricated collection name that sounds real but never existed. Amazon Science research at EMNLP 2024 specifically studied this problem and found that hallucinations in structured attributes (like GTIN, dimensions) are harder to detect than in unstructured text (descriptions), because they look syntactically valid.

**Why it happens:** LLMs are optimized to produce fluent, confident outputs. When asked "fill in the GTIN for this Prada dress," the model has no way to look up the actual barcode -- it will either leave it empty (good) or generate a plausible 13-digit number (catastrophic). The same applies to dimensions and collection names for obscure products.

**Consequences:**
- Enriched data looks complete but contains fabricated values
- Client sees high fill rates and selects a tool that is actually less accurate
- The entire evaluation becomes misleading -- quantity of fills masks quality

**Prevention:**
- Prompt design: Explicit instruction "Return empty string for any field you cannot verify. Never guess GTINs or dimensions." Test this on 10 products before running 500.
- Per-field hallucination scoring: Track not just "did the tool fill the field" but "is the filled value verifiable." GTINs can be checked against barcode databases (EAN-Search.org has 1B+ entries). Descriptions can be checked for factual claims not present in the input data.
- Confidence metadata: Ask LLMs to return confidence scores per field. Low-confidence fills should be flagged differently in the comparison UI.

**Detection:** Run a verification pass on a sample of 50 enriched products: Google the generated GTINs, check if dimensions are physically plausible, verify collection names against known brand seasons.

**Phase:** Address in Phase 1 (prompt design) and Phase 4 (UI should distinguish verified vs unverified fills).

---

### Pitfall 2: Unfair Comparison Due to Different Information Access

**What goes wrong:** The 4 core tools have fundamentally different capabilities -- Claude/Gemini see images but cannot search the web; Perplexity can search the web but has no vision; FireCrawl scrapes actual product pages. Comparing their fill rates head-to-head without acknowledging these differences leads to a misleading evaluation. For example, FireCrawl might find actual GTINs from product pages (genuine data), while Claude might hallucinate them (fake data), yet both show the same "fill rate."

**Why it happens:** The natural instinct is to create a uniform interface (`enrich(product) -> EnrichedFields`) and compare outputs directly. But the tools are not solving the same problem: LLMs are generating/inferring data from context, while scrapers are extracting real data from web pages. Descriptions from LLMs are synthetic; descriptions from scrapers are the brand's actual copy.

**Consequences:**
- Client picks the tool with the highest fill rate, which may be the tool that hallucinates most
- Scraping tools look "worse" because they honestly return empty for products they cannot find
- The evaluation fails its core purpose: informing a sound enrichment strategy

**Prevention:**
- Track field provenance: Every enriched field should carry metadata indicating whether it was "generated" (LLM inference), "extracted" (scraped from a real page), or "searched" (found via web search). The comparison UI must surface this distinction.
- Per-field accuracy scoring, not just fill rate: The client scoring system (1-5 stars) must evaluate correctness, not completeness. A description that is accurate but sparse should score higher than one that is fluent but fabricated.
- Separate scoring dimensions: Rate each tool on (a) fill rate, (b) accuracy, (c) description quality. Different tools will win different categories.

**Detection:** If all tools show similar fill rates, something is wrong -- LLMs and scrapers should have very different profiles.

**Phase:** Address in Phase 1 (metadata schema design) and Phase 4 (UI scoring dimensions).

---

### Pitfall 3: CSV Data Corruption from Embedded JSON

**What goes wrong:** The source CSV contains columns with deeply nested JSON (sizes, errors, images are all JSON arrays/objects embedded as CSV strings). Standard CSV parsing will break on commas inside these JSON fields if quoting is not handled perfectly. PapaParse does not natively support nested JSON structures (confirmed as "wontfix" in their issue tracker). Writing enriched CSVs back with the same structure will introduce corruption if JSON fields are not re-serialized correctly.

**Why it happens:** The original feed CSV was clearly generated from a database export that serialized complex objects into CSV columns. The `sizes` column alone contains arrays of objects with nested properties, commas, and quotes. Round-tripping this data through parse -> modify -> serialize is fragile.

**Consequences:**
- Silent data corruption: rows shift, fields misalign, JSON gets truncated
- The React UI loads garbage data and displays wrong products
- Debugging CSV issues is extremely time-consuming because errors are invisible until the UI breaks

**Prevention:**
- Parse once, normalize immediately: On first CSV read, convert the source CSV into a normalized internal format (TypeScript objects). Never re-parse the raw CSV multiple times.
- Use PapaParse with `quoteChar: '"'` and verify with a checksum: parse the CSV, count rows, verify against expected 500. If row count differs, the parse is wrong.
- Enriched CSVs should NOT include the complex nested JSON columns. Only include: product identifiers (sku, code, brand, name, model), the 6 enrichable fields, and enrichment metadata. Keep it flat.
- Alternatively, use JSON files instead of CSV for enriched output. They handle nested data natively and are easier to load in React.

**Detection:** After initial CSV parse, log row count and spot-check 5 random rows to verify field alignment. A misaligned CSV will have `brand` values in the `color` column.

**Phase:** Address in Phase 1 (foundation). This is the very first thing to get right.

---

### Pitfall 4: No Resume/Checkpoint for 500-Product Batch Runs

**What goes wrong:** Processing 500 products through an API takes 30-90 minutes per tool (depending on rate limits and concurrency). If the script crashes at product 347 due to a network error, rate limit, or API outage, all 347 successful results are lost and you restart from zero. This wastes both time and API credits/budget.

**Why it happens:** Developers build the "happy path" first: loop through products, call API, collect results, write CSV at the end. The failure mode of losing partial progress only becomes apparent after the first crash during a long run.

**Consequences:**
- Wasted API credits (real money: $5-10 per full run per tool)
- Multi-hour processing restarts from scratch
- Developer frustration and temptation to reduce the dataset size, which undermines the evaluation

**Prevention:**
- Write results incrementally: After each successful enrichment, append the result to a JSONL (JSON Lines) file. One line per product. Convert to CSV only at the end.
- Track progress by SKU: Before enriching a product, check if its SKU already exists in the output file. Skip if already enriched. This makes runs idempotent and resumable.
- Checkpoint every N products (e.g., every 10): log progress to console with counts and estimated time remaining.
- Use `p-limit` for concurrency but keep it conservative (2-3 concurrent) to avoid triggering rate limits.

**Detection:** If a run takes longer than expected or fails partway, check the output file for partial results before restarting.

**Phase:** Address in Phase 3 (CLI runner). This must be built into the runner from the start, not added after the first crash.

---

### Pitfall 5: Image URL Failures Silently Degrade LLM Quality

**What goes wrong:** The product feed contains image URLs from `sandbox-guidi.coralmatch.com` and `www.atelier-hub.com`. These are vendor-hosted images that may be behind hotlink protection, expired CDN tokens, or simply deleted. When Claude/Gemini receive a request with a broken image (or no image), they produce significantly worse descriptions because they are missing visual context. But this failure is silent -- the enrichment still "works," just with degraded quality.

**Why it happens:** Image URLs in vendor feeds are notoriously unreliable. CDN URLs expire, vendors reorganize their image servers, hotlink protection blocks non-browser requests. The first few rows of the CSV show images from `sandbox-guidi.coralmatch.com` (the "sandbox" prefix suggests these may be test/temporary URLs) and `atelier-hub.com` (a B2B wholesaler platform).

**Consequences:**
- LLM tools produce generic, low-quality descriptions for products where images failed to load
- The evaluation unfairly penalizes LLM tools vs scrapers (which find their own images)
- Inconsistent quality across the dataset makes aggregate scores unreliable

**Prevention:**
- Pre-flight image validation: Before running any enrichment, fetch every unique image URL with a HEAD request. Log which ones return 200 vs 404/403/timeout. This gives you a "image health" map.
- Download images locally first: Fetch all valid images to a local `images/` directory before enrichment. Reference local files for base64 encoding. This decouples image availability from API runtime.
- Track image availability per product: In the enrichment metadata, record `_images_available: 0|1|2|3`. The comparison UI can filter by image availability to compare tools fairly.
- Resize images to under 1568px per dimension and 5MB before sending to Claude (their documented limits). Large product photos will fail silently if they exceed these limits.

**Detection:** If Claude/Gemini descriptions for certain products are generic ("This is a fashion product in green") while others are detailed, check if the generic ones had broken images.

**Phase:** Address in Phase 1 (image utility) and Phase 2 (adapter error handling).

---

## Moderate Pitfalls

---

### Pitfall 6: Test/Placeholder Products in the Dataset

**What goes wrong:** The source CSV contains products with names like "Prodotto Test 3" (Italian for "Test Product 3") and brand "Brand di prova" (Italian for "Test Brand"). These are clearly test/placeholder records, not real products. Enrichment tools will either fail entirely on these or hallucinate wildly, since no real product data exists for them.

**Prevention:**
- Identify and flag test products before enrichment: filter by brand containing "prova", "test", "sample" or names containing "Prodotto Test". Exclude them from the enrichment runs or process them separately as a known-failure baseline.
- Document the exclusions so the client understands why the product count might be <500.

**Detection:** Scan the `name` and `brand` columns for Italian/English test keywords before running enrichment.

**Phase:** Address in Phase 1 (data normalization/cleanup).

---

### Pitfall 7: Rate Limit Cascading Across Concurrent Tool Runs

**What goes wrong:** Running multiple enrichment tools simultaneously (to save time) can trigger rate limits on shared infrastructure. Claude and Gemini have per-minute token limits (Claude Sonnet: 30K input tokens/min on Tier 1; Gemini Flash: 150 RPM on paid tier). FireCrawl has strict per-plan rate limits. Running them all at once can also saturate the developer's network connection, causing timeouts that look like API failures.

**Prevention:**
- Run tools sequentially, not in parallel. The total time is 4-6 hours regardless (500 products x 4 tools), but sequential runs are much more predictable and debuggable.
- Configure per-tool rate limiting: Claude (2 RPM conservative), Gemini (5 RPM), FireCrawl (per plan limits), Perplexity (check their tier limits).
- Use exponential backoff with jitter on 429 responses. Do not retry immediately.

**Detection:** Watch for sudden spikes in error rates partway through a run. If errors start at product ~100, you have likely hit a rate limit.

**Phase:** Address in Phase 3 (CLI runner concurrency configuration).

---

### Pitfall 8: Perplexity Structured Output Parsing Failures

**What goes wrong:** Perplexity's Sonar API supports JSON Schema structured outputs, but has known reliability issues. When using a new JSON schema, the first request takes 10-30 seconds to "prepare" the schema and may timeout. The `sonar-reasoning-pro` model wraps its JSON output in `<think>` reasoning tokens that must be stripped before parsing. Links returned in structured output are frequently hallucinated or broken.

**Prevention:**
- Send a "warm-up" request with the enrichment schema before processing the batch. Discard the result but ensure the schema is cached.
- Use `sonar-pro` (not `sonar-reasoning-pro`) to avoid the `<think>` token parsing issue, unless reasoning quality is noticeably better.
- Do not request URLs/links in the JSON schema. Let Perplexity return citations separately via its built-in citation mechanism.
- Wrap JSON parsing in try/catch with fallback: if structured output fails, attempt to extract JSON from the raw text response.

**Detection:** If Perplexity results show high error rates in the first 5-10 products but stabilize after, you hit the schema preparation issue.

**Phase:** Address in Phase 2 (Perplexity adapter implementation).

---

### Pitfall 9: Description Quality Varies Wildly by Product Category

**What goes wrong:** Enrichment quality is not uniform across product categories. Well-known products from major brands (Prada, Dsquared2, Alexander McQueen) will have abundant web data and distinctive visual features, leading to good enrichment from all tools. Niche products (Helen Kaminski hats, small boutique items) will have minimal web presence, causing scrapers to find nothing and LLMs to produce generic descriptions.

**Prevention:**
- Stratify the evaluation by category AND brand popularity. Do not just look at aggregate scores -- break down results by: (a) luxury mega-brands vs. niche brands, (b) product category (shoes, bags, hats, clothing), (c) data completeness of the original feed row.
- Build category/brand filters into the comparison UI from the start, not as an afterthought.
- Set expectations with the client: no tool will perform well on products with zero distinguishing information.

**Detection:** If a tool scores 4.5/5 on Prada but 1.5/5 on Helen Kaminski, the problem is data availability, not tool quality.

**Phase:** Address in Phase 4 (filter bar and aggregate reporting) and Phase 6 (comparison report).

---

### Pitfall 10: Ignoring Existing Partial Data When Enriching

**What goes wrong:** Many products in the feed already have SOME data filled in (season, year, collection, materials, made_in). If the enrichment prompt sends all fields to an LLM without indicating which are already populated, the LLM may overwrite correct existing values with different (possibly wrong) ones. For example, a product already has `season: FW23` and `year: 2023`, but the LLM "enriches" it to `season: AW23` (different format) and `year: 2022` (wrong).

**Prevention:**
- Only request enrichment for fields listed in the product's `errors` column. The CSV already identifies which fields are missing per product -- use this as the authoritative list.
- In the LLM prompt, explicitly list which fields are already known and instruct: "Do NOT modify these existing values. Only fill in the missing fields listed below."
- Compare enriched values against originals before writing: if an enriched field contradicts an existing non-empty value, flag it as a conflict rather than silently overwriting.

**Detection:** Diff the enriched CSV against the base CSV. If "already-filled" fields changed, the overwrite problem is present.

**Phase:** Address in Phase 1 (prompt template design) and Phase 2 (adapter output validation).

---

## Minor Pitfalls

---

### Pitfall 11: Base64 Image Encoding Inflates API Costs

**What goes wrong:** Sending product images as base64 in every API request significantly increases payload size. A 500KB product image becomes ~667KB in base64. With 500 products and potentially multiple images per product, this adds up. Claude charges based on image tokens (~1,600 tokens per image under 1.15MP). If images are not resized before encoding, oversized images either fail (Claude: 5MB limit, 8000px max dimension) or consume excessive tokens.

**Prevention:**
- Resize all images to max 1024px on the longest side before base64 encoding. This keeps images well within Claude's 1568px sweet spot while reducing token cost.
- Send only the first/best image per product, not all available images.
- For Gemini, consider using the File API instead of base64 for repeated use.

**Detection:** Monitor API cost after the first 50 products. If it is tracking above the $5-10 estimate, images are likely too large.

**Phase:** Address in Phase 1 (image utility).

---

### Pitfall 12: LocalStorage Scoring Data Loss

**What goes wrong:** The plan uses localStorage for client scoring (1-5 stars per tool per product). localStorage is browser-specific and can be cleared by the user (or browser cleanup tools) without warning. If the client scores 200 products across a demo session, then clears their browser data, all scores are gone.

**Prevention:**
- Add an "Export Scores" button that downloads scoring data as JSON or CSV. Prompt the client to export periodically.
- Consider using IndexedDB (higher storage limits, same browser-local model) via a wrapper like `idb-keyval` for a slightly more robust local store.
- For a demo/presentation context, this is acceptable risk. For extended evaluation, add a simple JSON file save/load mechanism.

**Detection:** Not detectable until data is lost. The export button is the insurance policy.

**Phase:** Address in Phase 4 (ScoringPanel component).

---

### Pitfall 13: FireCrawl Credit Exhaustion Mid-Run

**What goes wrong:** FireCrawl charges 2 credits per 10 search results (without scraping) or more with scraping enabled. Additional features like stealth proxy (+4 credits) and structured JSON extraction (+5 credits) can multiply costs. At ~3 credits per product (as documented in the existing system), 500 products requires ~1,500 credits. The Hobby plan includes only 3,000 credits/month. If you need to re-run (due to bugs, schema changes, or testing), you can exhaust credits quickly.

**Prevention:**
- Run FireCrawl on a small batch first (20 products) to validate the adapter and measure actual credit consumption.
- Do not use stealth proxy or structured extraction unless basic scraping fails. Start with the cheapest option.
- Track remaining credits via the FireCrawl dashboard between runs.

**Detection:** Monitor the FireCrawl dashboard credits counter during the first batch. Calculate burn rate and project whether 500 products fits within budget.

**Phase:** Address in Phase 2 (FireCrawl adapter) and Phase 3 (runner budget tracking).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Phase 1: Foundation | CSV corruption from nested JSON (Pitfall 3) | Flatten enriched output schema. Validate parse with row counts. |
| Phase 1: Foundation | Test products polluting results (Pitfall 6) | Filter `brand`/`name` for test keywords before enrichment. |
| Phase 1: Foundation | Overwriting existing data (Pitfall 10) | Use `errors` column to drive which fields to enrich. |
| Phase 1: Foundation | Image failures degrading LLM quality (Pitfall 5) | Pre-flight HEAD requests on all image URLs. Download locally. |
| Phase 2: Adapters | LLM hallucination (Pitfall 1) | Prompt: "leave empty rather than guess." Verify on 10-product sample. |
| Phase 2: Adapters | Perplexity parsing failures (Pitfall 8) | Schema warm-up request. Use `sonar-pro`. Try/catch JSON parse. |
| Phase 2: Adapters | FireCrawl credit burn (Pitfall 13) | Test on 20 products first. Avoid premium features. |
| Phase 3: CLI Runner | No resume on crash (Pitfall 4) | JSONL incremental writes. SKU-based deduplication on restart. |
| Phase 3: CLI Runner | Rate limit cascading (Pitfall 7) | Sequential tool runs. Conservative concurrency per tool. |
| Phase 4: UI | Unfair tool comparison (Pitfall 2) | Track field provenance. Multi-dimension scoring. |
| Phase 4: UI | Category-blind aggregate scores (Pitfall 9) | Stratify by brand/category in filters and reports. |
| Phase 4: UI | Scoring data loss (Pitfall 12) | Export button for scoring data. |
| Phase 6: Polish | Misleading aggregate report | Break down by category, brand popularity, field type. |

## Sources

- [Amazon Science: Hallucination Detection in LLM-enriched Product Listings](https://www.amazon.science/publications/hallucination-detection-in-llm-enriched-product-listings) (EMNLP 2024) -- HIGH confidence
- [Claude Vision API Docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- HIGH confidence (image size/token limits)
- [Claude Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) -- HIGH confidence
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) -- HIGH confidence
- [FireCrawl Rate Limits](https://docs.firecrawl.dev/rate-limits) -- HIGH confidence
- [Perplexity Structured Outputs Guide](https://docs.perplexity.ai/guides/structured-outputs) -- HIGH confidence (schema warm-up, reasoning token issues)
- [PapaParse Nested Structures Issue #134](https://github.com/mholt/PapaParse/issues/134) -- HIGH confidence (wontfix status)
- [Pixyle: Comparison of Top AI Data Enrichment Tools](https://www.pixyle.ai/blog/comparison-of-top-ai-data-enrichment-tools) -- MEDIUM confidence
- [Airbyte: Idempotency in Data Pipelines](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines) -- MEDIUM confidence
- [EAN-Search.org](https://www.ean-search.org/) -- MEDIUM confidence (GTIN verification service)

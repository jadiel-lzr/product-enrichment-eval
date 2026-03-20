# Research: Script Audit + Variant Confidence Tagging

**Date:** 2026-03-20
**Task:** 260320-dho

---

## 1. URL Patterns That Indicate Color/Size Variants in CDNs

### Shopify (`/cdn/shop/files/` or `/cdn/shop/products/`)

Shopify URLs carry no inherent color/variant semantics — variants are encoded in the filename, not the path structure. Size is encoded in `?width=N` query params.

**Variant signals in Shopify URLs:**
- Sequential numeric suffix: `_001`, `_002`, `_003`, `_004` — the canonical pattern from the checkpoint data (MB0122S). Also `_01`, `_02` style.
- UUID suffix appended to a base filename: `kering_2FMB0122S_001_e48b0bcb-9eea-49a8-85f1-a7a4e0e4f15a.png` — the same product code repeated with different UUIDs is a multi-variant gallery.
- Color in filename: `600079351BLK_1_...jpg` (color code before underscore), or `Miffy_Sitting_Corduroy_Pink_...jpg` (color name).
- Width param (`?width=N`) is size-only, not a color variant.

**Detected in checkpoint for product `2000000029733` (Montblanc MB0122S):**
```
kering_2FMB0122S_001_<uuid>.png  → variant 001 (appears twice at different widths)
kering_2FMB0122S_002.png         → variant 002
kering_2FMB0122S_003.png         → variant 003
kering_2FMB0122S_004.png         → variant 004
```
This is a textbook case: same product code, sequential `_00N` suffix = 4 color/model variants on the same page. No color info can be inferred from the URL; the page itself would need to be inspected.

### Cloudinary (`cdn-images.italist.com`, `media-catalog.giglio.com`, `cdn.modaoperandi.com`)

Cloudinary transformation params sit between `/upload/` and the image hash/path. Key patterns:

- **Transform chain in path:** `/image/upload/t_medium_dpr_2_q_auto_v_2,f_auto/<hash>.jpg` — single image, no variant info in URL.
- **`e_background_removal` prefix:** `e_background_removal/t_medium_dpr_2_q_auto_v_2,f_auto/<hash>.jpg` — background-removed version of same image; different hash = different product.
- **Giglio view suffix:** `F82490.028_1/blumarine.jpg`, `_2`, `_3`, `_4`, `_5` — these are **view angles** of the same product (front, back, side, detail), NOT color variants. All share the same product code prefix (`F82490.028`).
- **italist Next.js proxy:** `_next/image?url=<encoded-cloudinary-url>&w=256&q=75` — these are thumbnail wrappers around full CDN URLs. They represent the same image at a smaller size, not a variant.

**Truncated Cloudinary URLs (already blocked by `isValidImageUrl`):**
The regex `/\/image\/upload\/(?:[^/]+\/)*[^/.]+$/` correctly rejects URLs like `/image/upload/t_medium/some-hash` that have transform params but no file extension. This is a good guard.

### onlylens (Shopify-based, Kering content)

Pattern: `kering_2F{MODEL}_{NNN}.png` where `{NNN}` is `001`–`004`.
- `kering_2F` is URL-decoded form of `kering/` (percent-encoding of `/`)
- `_001` through `_004` are the classic sequential variant suffixes

These are view angles or colorways from Kering's DAM, not size variants. Because Montblanc glasses have distinct colorways per model (MB0122S 001, 002, 003, 004 are literally different color variants in the product line), this is the highest-value detection case.

### Kering DAM (`amq-mcq.dam.kering.com`)

Pattern: `eCom-{PRODUCT_CODE}_{SHOT}.jpg?v=N`

Shot codes are shot angles, not color variants:
- `_F` = front
- `_R` = back (rear)
- `_D` = detail
- `_E` = environmental / lifestyle
- `_A`, `_L`, `_M` = additional angles

All images with the same product code are the same colorway. Multiple shot codes = multi-angle gallery for one product. **These are NOT variant indicators** — they indicate rich gallery coverage, which is a good sign.

### Farfetch (`cdn-images.farfetch-contents.com`)

Pattern: `/{aa}/{bb}/{cc}/{dd}/{product_id}_{image_id}_{size}.jpg`

- The last segment before `.jpg` is a size class: `1000`, `480`, `300`
- The `{image_id}` portion changes for each view angle
- Same `{product_id}`, different `{image_id}` = same product, different angles (NOT color variants)

For product `3937014`, images like `26677023_56419237_1000.jpg` and `26677023_56419237_300.jpg` are the same image at different resolutions — this is a size variant, not a color variant. The `deduplicateSizeVariants` function does not handle Farfetch's numeric size suffix pattern; it only handles named sizes (`original`, `large`, etc.).

### cbmadeinitaly.com (WordPress `/assets/uploads/`)

Pattern: `{ModelName}_{Gender}_{Color}_{Material}_{NNN}-{M}.jpg`

Example: `Eva_M_Chocolate_Suede_001-4.jpg`
- `_001` = photo #1 of this product
- `-4` = appears to be a WordPress upload deduplication suffix (same filename uploaded multiple times)

The color is **explicitly in the filename** — `Chocolate`, `Black`, `Dark_Brown`, `Tobacco`, `Blue`. These URLs are high-confidence, no variant ambiguity.

### lbm1911.com (Shopify)

Pattern: `{code}_{view_number}-{description}.jpg`

Example: `3687_S_63406_2_01-abito-paul-gessato-in-lana-marrone.jpg` through `_99`

The numeric suffix (`_01`, `_02`, `_11`, `_41`–`_46`, `_90`, `_99`) are shot/view codes, not color variants.

### Hugo Boss (`images.hugoboss.com` — Scene7)

Pattern: `{model_code}_{colorcode}_{viewcode}?{transform_params}`

Example: `hbna58609833_999_220`, `_240`, `_200`, `_210`

The trailing `_NNN` is a **view angle code** (220=front, 240=back, etc.), not a color variant. Color is encoded in the middle segment (`999` = black typically).

### Demandware/SFCC (`dw/image/v2/`)

Pattern: `{brand_instance}/on/demandware.static/-/Sites-{catalog}/default/{cache_id}/images/{view_type}/{product_code}_{color_or_variant}_{view_index}.jpg`

Examples from Off-White: `OGAA001S25JER008_3001_0.jpg`, `_1.jpg`, `_5.jpg`

- Color/variant = `3001` (encoded color ID)
- View index = `0`, `1`, `5` = shot angles
- Same product code + same color + different view index = same product, multiple angles
- Same product code + **different color code** = different variant

The SFCC pattern encodes **color** in the filename. This is directly useful for variant detection: if the captured URL has a different color code from what we searched for, we have a cross-variant contamination.

---

## 2. Race Condition Analysis: Lines 154–188 (enrich-noimg-phase2.ts)

**The code in question (lines 152–183):**

```typescript
const updatedProgress: Phase2Progress = { completed: { ...progress.completed } }

await Promise.all(
  remaining.map((sku) =>
    concurrencyLimit(async () => {
      // ... processing ...

      const verifiedUrls = imageUrls.length > 0 ? imageUrls : undefined
      const newCompleted = { ...updatedProgress.completed, [sku]: verifiedUrls }  // line 180
      Object.assign(updatedProgress.completed, { [sku]: verifiedUrls })           // line 181
      savePhase2Progress({ completed: newCompleted })                              // line 182
    }),
  ),
)
```

**There is a real race condition here.** Here is the exact failure mode:

`updatedProgress.completed` is a shared mutable object. With `CONCURRENCY = 10`, up to 10 workers are running simultaneously. Each worker reads `updatedProgress.completed` on line 180 to build `newCompleted`, then mutates it on line 181, then writes `newCompleted` (the snapshot) to disk on line 182.

The problem:

1. Worker A (SKU 111) reads `updatedProgress.completed` at line 180: `{100: [...], 200: [...]}`
2. Worker B (SKU 222) reads `updatedProgress.completed` at line 180 (same state): `{100: [...], 200: [...]}`
3. Worker A mutates at line 181: adds `111: [...]` to the shared object
4. Worker B mutates at line 181: adds `222: [...]` to the shared object
5. Worker A writes `newCompleted` (its snapshot from step 1): `{100, 200, 111}` — **missing 222**
6. Worker B writes `newCompleted` (its snapshot from step 2): `{100, 200, 222}` — **missing 111**

The last write wins, and it will be missing any SKU that was written between step 1 and step 5 by a different worker. With concurrency 10 and fast workers, this is likely happening every run.

**Severity: Medium.** Checkpoints are not completely lost — each SKU's result is safe once it's the last write. But a crash between writes could leave the checkpoint missing recently completed SKUs, forcing re-processing. The `Object.assign` mutation on line 181 diverges from the immutability rules; both lines 180-181 together are redundant (only one is needed) and in conflict.

**The root cause:** Two separate representations of truth exist simultaneously — the spread-into `newCompleted` (immutable snapshot) and the `Object.assign` mutation of `updatedProgress.completed`. The mutation is pointless because `newCompleted` is built from another snapshot of `updatedProgress.completed` that races against other workers.

---

## 3. `verifyUrl()` Using GET vs HEAD

**Current behavior:** `verifyUrl()` uses `method: 'GET'` with `res.body.cancel()` immediately after status check.

**Risks:**

1. **Bandwidth waste:** Each GET downloads response headers + beginning of response body before the cancel kicks in. For product pages this can be 5–50KB per request. With 10 concurrent verifications × multiple candidates per SKU, this adds up over hundreds of products.

2. **Rate limiting:** More aggressive CDNs and luxury brand sites (Burberry `assets.burberry.com`, Kering DAM) track bandwidth consumption, not just request count. GET requests are heavier signals than HEAD requests and may trigger 429s sooner.

3. **Correctness advantage of current approach:** Many servers (especially Shopify stores, italist CDN, CloudFront) do not support HEAD requests or return different status codes for HEAD vs GET. Using GET avoids false negatives where HEAD returns 405 or 403 but GET would succeed. The `res.body.cancel()` call mitigates most of the bandwidth concern by aborting the body stream quickly.

4. **Soft redirect detection (line 82–89) requires GET:** The redirect-to-category detection logic reads `res.url` which is the final URL after redirect following. HEAD requests also follow redirects and expose `res.url`, so this specific feature does not require GET.

**Assessment:** The GET approach is a pragmatic tradeoff given Shopify/CDN HEAD quirks. The bandwidth risk is real but secondary. A bigger risk is that `res.body.cancel()` may not always abort before significant data is downloaded (depends on Node.js HTTP buffering). Switching to HEAD with a GET fallback on 405 would be the clean solution, but carries implementation complexity.

---

## 4. `extractRelevantHtml()` Limiting to 10 `<img>` Tags

**The code (lines 211–213):**

```typescript
const imgTags = html.match(/<img\s[^>]*src=["'][^"']+["'][^>]*>/gi)
if (imgTags) parts.push(...imgTags.slice(0, 10))
```

**Impact on product galleries:**

The limit of 10 is applied to raw `<img>` tags from the body — but the function prioritizes `<head>` (og:image) and JSON-LD first. In practice, product images on most luxury e-commerce sites are loaded via:

- **JSON-LD structured data** (`@type: Product`, `image` field) — captured in full, no limit applied. This is the most reliable source.
- **og:image meta tag** — captured in full via the `<head>` extraction.
- **`<img>` tags in body** — the fallback. The 10-tag limit is hit here.

**Scenarios where 10 is too few:**
1. Sites where images are only in `<img>` body tags (not JSON-LD), with navigation/header images appearing before product images in DOM order. The regex captures tags in document order, so the first 10 may be site chrome (logos, nav icons), not product photos. However, `isValidImageUrl` in the LLM parsing filters most of these out.
2. Gallery-heavy pages where the first 10 `<img>` tags are all thumbnails of other products (e.g., "related products" section appearing early in HTML).

**Scenarios where 10 is fine:**
- Most luxury product pages put og:image and JSON-LD structured data — the `<img>` limit is never reached as primary source.
- Sites like cbmadeinitaly.com where JSON-LD is present.

**Real impact:** For sites that serve all images via `<img>` tags without JSON-LD (some older luxury brand sites), the 10-tag cap means the LLM receives only the first 10 body images. If navigation images dominate the first 10, the LLM may return no product images. The Firecrawl fallback then handles this case.

**Observed in checkpoint:** The slowear.com product (SKU 3921374) returned 10 images — all 10 are distinct product images from a Shopify CDN. This suggests the 10-tag limit was hit exactly and may have cut off additional views. But 10 images is sufficient for enrichment purposes.

---

## 5. Actual Variant Patterns in checkpoint-noimg-phase2.json

### Pattern 1: Sequential `_00N` Suffix (onlylens/Shopify + Kering content)

**Product 2000000029733 (Montblanc MB0122S):**
```
kering_2FMB0122S_001_<uuid>.png   (appears twice: width=2048 and width=1920)
kering_2FMB0122S_002.png
kering_2FMB0122S_003.png
kering_2FMB0122S_004.png
```
Classic `_001`–`_004` variant pattern. `MB0122S` is the product code; `001`–`004` are colorway variants. The pipeline has no way to know which variant matches the feed's requested color without inspecting the page content or Kering's product catalog.

### Pattern 2: Shot Angle Codes (Kering DAM / amq-mcq.dam.kering.com)

**Products AMCRMQ06.BLKWHI, AMCRMQ05.BLACK, AMCRWQ07.BLK, etc.:**
```
eCom-553680WHGP51070_F.jpg   → front
eCom-553680WHGP51070_R.jpg   → rear
eCom-553680WHGP51070_D.jpg   → detail
eCom-553680WHGP51070_E.jpg   → environmental
```
These are NOT color variants — same product, same color, multiple angles. `_F/_R/_D/_E` = gallery views. The product code encodes the color (e.g., `WHGP51070` contains a color suffix). **These should NOT trigger variant_uncertain.**

### Pattern 3: Junk/Generic CloudFront Header Images

**Appears in 7+ products: SKUs 133299, 177728, 199942, 211049, 255478, 287757, 658702, 3898924, CHF5WG05.GLD:**
```
https://d3adw1na09u8f7.cloudfront.net/2024/01/02193948/Header-CB-Made-In-Italy.jpg
```
This is the CB Made In Italy brand header/banner image, not a product photo. It is repeatedly included alongside legitimate italist product images. The filename `Header-CB-Made-In-Italy.jpg` should be caught by the `banner` filter in `isValidImageUrl` but currently is not — the filter checks for `banner` case-insensitively and `Header` does not match. **This is a bug in the filter.**

**Also for SKU 3850073 and 3898924:**
```
https://d3adw1na09u8f7.cloudfront.net/2024/05/30201547/DG.png
```
This is the Dolce & Gabbana brand logo (`DG.png`). The `logo` filter in `isValidImageUrl` should catch this — but `DG.png` doesn't contain the word "logo". This slips through. **Another filter gap.**

### Pattern 4: Same-Image Different-Size Duplicates (Farfetch)

**Product 3937014:**
```
26677023_56419237_1000.jpg
26677023_56419245_300.jpg
26677023_56419248_300.jpg
...
26677023_56419237_300.jpg   ← same image_id as the 1000 above
```
The `_300` and `_1000` suffixes are size variants of the same image. `deduplicateSizeVariants` doesn't handle this Farfetch-specific pattern (it only handles named sizes like `original/large/big`).

### Pattern 5: Giglio View Suffixes (`_1`, `_2`, `_3`, `_4`, `_5`)

**Products 3920764, 3922754, 3936994, DN0233A0219.8W921:**
```
F82490.028_1/blumarine.jpg   → view 1
F82490.028_2/blumarine.jpg   → view 2
F82490.028_3/blumarine.jpg   → view 3
```
Sequential single-digit integer suffix in the path segment before the brand slug. These are view angle codes, not color variants. The product code is stable across all views.

### Pattern 6: SFCC View Index at End of Filename

**Off-White products (OGAA001S26JER002.100):**
```
OGAA001S25JER008_3001_0.jpg
OGAA001S25JER008_3001_1.jpg
OGAA001S25JER008_3001_5.jpg
```
Last numeric segment (`_0`, `_1`, `_5`) = view index. Middle segment (`3001`) = color code. Same color code = same variant. Same product code + different color code = different variant.

### Pattern 7: thewebster.com View Codes

**Product COCRWK01.BLK:**
```
PERCJU001VY0014_Black_01_1.jpg
PERCJU001VY0014_Black_02.jpg
PERCJU001VY0014_Black_03.jpg
PERCJU001VY0014_Black_04.jpg
PERCJU001VY0014_Black_05.jpg
```
Color (`Black`) is **in the filename**. Trailing `_01`–`_05` = view angles. Both `?height=160&width=120` and `?height=774&width=580` variants appear — the small/large size duplicates aren't deduplicated. The `deduplicateUrls` function only deduplicates exact URLs, not same-image different-size.

### Pattern 8: ModaOperandi View Subdirectories

**Product COF5WT02.AZU:**
```
/1039526/685664/medium_courreges-...jpg
/1039526/685664/small_courreges-...jpg
/1039526/685664/large_courreges-...jpg
/1039526/685664/c/small_...jpg
/1039526/685664/c2/small_...jpg
/1039526/685664/c3/small_...jpg
/1039526/685664/z/small_...jpg
```
`c`, `c2`, `c3`, `z` subdirectories = different views. `medium/small/large` = sizes of main view. The `deduplicateSizeVariants` function handles `small/medium/large` but not the `c/c2/c3` view path variation. These are not color variants.

---

## Summary of Actionable Findings for Plan

### For Script Audit (SCRIPT-AUDIT.md)

| # | Location | Issue | Severity |
|---|----------|-------|---------|
| 1 | phase2 L180–181 | Race condition: `Object.assign` on shared `updatedProgress.completed` inside concurrent workers; `newCompleted` snapshot is stale by write time | Medium |
| 2 | phase2 L181 | Redundancy: `Object.assign` mutation is pointless since `newCompleted` (line 180) already captured the intent; mutation diverges from immutability rules | Low |
| 3 | noimg-claude-adapter `verifyUrl()` | Uses GET not HEAD; bandwidth waste and potential earlier rate-limiting on luxury CDNs | Low |
| 4 | noimg-claude-adapter `isValidImageUrl()` | `Header-CB-Made-In-Italy.jpg` not caught by `banner` filter (capital H, starts with `Header-`); `DG.png` not caught by `logo` filter | Medium |
| 5 | noimg-claude-adapter `extractRelevantHtml()` | 10 `<img>` tag limit may miss product images on sites without JSON-LD where site chrome appears first in DOM | Low |
| 6 | noimg-claude-adapter `deduplicateSizeVariants()` | Does not handle Farfetch `_300`/`_1000` numeric size suffix or thewebster thumbnail vs full-size duplicates | Low |

### For Variant Confidence Tagging

**Reliable variant detection heuristic for `image_confidence` field:**

The `_00N` pattern (where N is a single digit, preceded by product code) is the **only URL pattern in this dataset that reliably signals unknown color variants.** Specifically:

- `/{code}_001.`, `/{code}_002.`, `/{code}_003.` etc. in Shopify/onlylens URLs where the code matches the searched product code
- Presence of 2+ URLs with the same product code but different `_00N` suffixes where N differs

All other multi-image patterns (`_F/_R/_D/_E`, `_1/_2/_3/_4/_5`, `_0/_1/_5` SFCC) are **view angles of a single product**, not color variants — and should NOT trigger `variant_uncertain`.

**Recommended `image_confidence` logic:**

```
verified       → color field is non-empty AND no _00N variant pattern detected
variant_uncertain → color field is empty OR _00N variant pattern detected in any image URL
unverified     → default / no images found
```

The key test: does any URL in the set match `/_0[0-9]{2}[._]/` **where N ≥ 002** (i.e., at least variant 002 exists alongside 001)?

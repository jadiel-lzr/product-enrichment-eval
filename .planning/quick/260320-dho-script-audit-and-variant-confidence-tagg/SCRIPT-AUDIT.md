# Script Audit: enrich-noimg Pipeline

Audited: enrich-noimg.ts (Phase 1), enrich-noimg-phase2.ts (Phase 2), noimg-claude-adapter.ts (shared adapter)
Date: 2026-03-20

## Issues

### #1 — Race condition in Phase 2 checkpoint saves

**Severity:** Medium
**Location:** enrich-noimg-phase2.ts lines 179-182

**Description:** `updatedProgress.completed` is a shared mutable object. With `CONCURRENCY=10`, up to 10 workers run simultaneously inside `Promise.all`. Each worker reads `updatedProgress.completed` on line 180 to build `newCompleted` (a snapshot), then mutates it via `Object.assign` on line 181, then writes the snapshot to disk on line 182.

Failure mode:
1. Worker A (SKU 111) reads `updatedProgress.completed`: `{100: [...], 200: [...]}`
2. Worker B (SKU 222) reads the same state: `{100: [...], 200: [...]}`
3. Worker A mutates at line 181: adds `111: [...]` to shared object
4. Worker B mutates at line 181: adds `222: [...]` to shared object
5. Worker A writes `newCompleted` (its snapshot from step 1): `{100, 200, 111}` -- missing 222
6. Worker B writes `newCompleted` (its snapshot from step 2): `{100, 200, 222}` -- missing 111

The last write wins, and it will be missing any SKU written between another worker's read and write. With concurrency 10 and fast workers, this is likely occurring every run. A crash between writes could leave the checkpoint missing recently completed SKUs, forcing re-processing.

**Fix:** Replace the `Object.assign` mutation on the shared object with a write-lock pattern or move to a sequential checkpoint flush. Simplest safe fix: remove the `Object.assign` on line 181 entirely and use a mutex (or serialize checkpoint writes with a per-SKU Map that accumulates in-memory, flushed atomically after `Promise.all` completes).

**Note:** `Object.assign` on line 181 also violates the project's immutability rules -- the mutation is redundant since `newCompleted` already captures the intent as a snapshot.

### #2 — isValidImageUrl: banner filter misses capital-H "Header-" prefix

**Severity:** Medium
**Location:** noimg-claude-adapter.ts `isValidImageUrl()` line 111

**Description:** The URL `https://d3adw1na09u8f7.cloudfront.net/2024/01/02193948/Header-CB-Made-In-Italy.jpg` passes the banner filter because the regex `/banner/i` does not match the word "Header". The file is the CB Made In Italy brand header/banner image, not a product photo. Observed in 7+ products (SKUs 133299, 177728, 199942, 211049, 255478, 287757, 658702, 3898924, CHF5WG05.GLD).

**Fix:** Add `header[_-]` to the existing banner regex pattern. Implemented in this quick task (Task 3).

### #3 — isValidImageUrl: logo filter misses short brand acronym filenames

**Severity:** Medium
**Location:** noimg-claude-adapter.ts `isValidImageUrl()` line 109

**Description:** `DG.png` (Dolce & Gabbana logo from `d3adw1na09u8f7.cloudfront.net`) passes the logo filter because it does not contain the word "logo". Observed for SKUs 3850073 and 3898924.

**Fix:** Add a pattern for short (2-5 char) uppercase-only filenames followed by an image extension: `/\/[A-Z]{2,5}\d?\.(png|jpg|jpeg|svg|gif)$/i`. Implemented in this quick task (Task 3).

### #4 — verifyUrl uses GET not HEAD

**Severity:** Low
**Location:** noimg-claude-adapter.ts `verifyUrl()` lines 59-96

**Description:** Every URL verification downloads response headers + beginning of body via GET before `res.body.cancel()`. With `CONCURRENCY=10` and multiple candidates per product, this adds bandwidth overhead and may trigger rate limiting sooner on luxury CDNs (Kering DAM, Burberry `assets.burberry.com`). The GET approach is intentional -- Shopify and many CDNs return 405 or incorrect status codes for HEAD requests, and the soft-redirect detection on `res.url` works equally well with either method.

**Recommendation:** Accept as-is unless rate limiting becomes a problem. If it does: implement HEAD with GET fallback on 405.

### #5 — extractRelevantHtml caps at 10 img tags

**Severity:** Low
**Location:** noimg-claude-adapter.ts `extractRelevantHtml()` line 213

**Description:** `imgTags.slice(0, 10)` limits body `<img>` tag fallback to 10 tags. For sites without JSON-LD where site chrome (nav icons, logos) precedes product images in DOM order, the first 10 tags may be all noise. Observed as a near-miss for slowear.com (SKU 3921374) where exactly 10 images were returned. The Firecrawl fallback recovers most of these cases.

**Recommendation:** Increase to 20 or filter chrome images before the cap. Low priority -- Firecrawl is an effective safety net.

### #6 — No overall timeout on Phase 2 Promise.all

**Severity:** Low
**Location:** enrich-noimg-phase2.ts lines 154-189

**Description:** The outer `Promise.all` has no `AbortController` or deadline. If a single worker hangs (e.g. a stalled Firecrawl request that bypasses the 15s `fetchHtml` timeout), the entire run waits indefinitely.

**Recommendation:** Wrap each `concurrencyLimit` worker in a `Promise.race` with a per-SKU timeout (e.g. 120s). Or rely on the existing per-fetch timeouts being sufficient.

### #7 — Silent failure when FIRECRAWL_API_KEY missing

**Severity:** Low
**Location:** noimg-claude-adapter.ts `extractViaFirecrawl()` lines 243-249

**Description:** Missing `FIRECRAWL_API_KEY` silently returns `undefined` with only a `console.log`. If the key is misconfigured, direct-fetch failures will fall through without Firecrawl backup and the operator has no clear signal that the fallback is disabled.

**Recommendation:** On startup (in `enrich-noimg-phase2.ts`), warn loudly if `FIRECRAWL_API_KEY` is not set: "FIRECRAWL_API_KEY not set -- Firecrawl fallback disabled. Products requiring JS rendering will receive no images."

### #8 — deduplicateSizeVariants misses Farfetch and thewebster numeric size suffixes

**Severity:** Low
**Location:** noimg-claude-adapter.ts `deduplicateSizeVariants()`

**Description:** Handles named sizes (`original`/`large`/`big`/`medium`/`small`) but not Farfetch's `_300`/`_1000` suffix pattern or thewebster's `?height=160&width=120` vs `?height=774&width=580` thumbnail duplication. Products 3937014 (Farfetch) and COCRWK01.BLK (thewebster) both have avoidable duplicate URLs in their Phase 2 output.

**Recommendation:** Add Farfetch numeric suffix deduplication: group by path with trailing `_NNN` stripped, keep highest number. For thewebster: the existing `isValidImageUrl` width filter (<=200px) should already drop the small thumbnails -- verify.

## Not-an-Issue Notes

- **Kering DAM `_F`/`_R`/`_D`/`_E` shot codes:** These are view angles of ONE product, not color variants. Correct behavior is to keep all of them.
- **Giglio `_1`/`_2`/`_3`/`_4`/`_5` view suffixes:** Same -- view angles, not color variants.
- **SFCC `_0`/`_1`/`_5` view indices:** Same.
- **Cloudinary truncated URL filter (`/image/upload/...no-extension`):** Already correctly handled by existing regex.

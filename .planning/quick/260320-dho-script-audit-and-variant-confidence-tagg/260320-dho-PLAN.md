---
phase: 260320-dho
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md
  - enrichment/src/types/noimg-enriched.ts
  - enrichment/src/scripts/enrich-noimg-phase2.ts
  - enrichment/src/adapters/noimg-claude-adapter.ts
  - frontend/src/types/enrichment.ts
  - frontend/src/lib/csv-loader.ts
  - frontend/src/components/comparison/EnrichmentCard.tsx
autonomous: true
requirements: [AUDIT-01, CONFIDENCE-01, FILTER-01]

must_haves:
  truths:
    - "SCRIPT-AUDIT.md documents every known issue with severity, location, and fix recommendation"
    - "Phase 2 script writes image_confidence to each CSV row after image extraction"
    - "Products with _001/_002+ URL patterns and no color get image_confidence = 'variant_uncertain'"
    - "Products with a color field get image_confidence = 'verified'"
    - "Products with no images get image_confidence = 'unverified'"
    - "EnrichmentCard shows amber badge for variant_uncertain, green badge for verified, nothing for unverified"
    - "isValidImageUrl blocks Header-CB-Made-In-Italy.jpg and DG.png"
  artifacts:
    - path: ".planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md"
      provides: "Audit report with all 6 issues documented"
    - path: "enrichment/src/types/noimg-enriched.ts"
      provides: "image_confidence field in NoImgEnrichedFieldsSchema"
      exports: ["NoImgEnrichedFieldsSchema", "NoImgEnrichedFields"]
    - path: "enrichment/src/scripts/enrich-noimg-phase2.ts"
      provides: "image_confidence detection and CSV write logic"
    - path: "enrichment/src/adapters/noimg-claude-adapter.ts"
      provides: "Fixed isValidImageUrl with case-insensitive header + short logo patterns"
    - path: "frontend/src/types/enrichment.ts"
      provides: "imageConfidence field on ToolEnrichment interface"
    - path: "frontend/src/lib/csv-loader.ts"
      provides: "image_confidence parsed from CSV into imageConfidence"
    - path: "frontend/src/components/comparison/EnrichmentCard.tsx"
      provides: "image confidence badge rendered in URL Discovery section"
  key_links:
    - from: "enrichment/src/scripts/enrich-noimg-phase2.ts"
      to: "enrichment/src/types/noimg-enriched.ts"
      via: "image_confidence field added to schema — phase 2 sets it before writeProductCSV"
      pattern: "image_confidence"
    - from: "frontend/src/lib/csv-loader.ts"
      to: "frontend/src/types/enrichment.ts"
      via: "buildToolEnrichment reads row['image_confidence'] → imageConfidence on ToolEnrichment"
      pattern: "imageConfidence"
    - from: "frontend/src/components/comparison/EnrichmentCard.tsx"
      to: "frontend/src/types/enrichment.ts"
      via: "enrichment.imageConfidence drives badge render"
      pattern: "imageConfidence"
---

<objective>
Three deliverables for the no-image enrichment pipeline: (1) write SCRIPT-AUDIT.md documenting known issues in enrich-noimg, enrich-noimg-phase2, and noimg-claude-adapter; (2) add image_confidence field to Phase 2 output and surface it as a badge in the frontend; (3) fix two existing filter bugs in isValidImageUrl.

Purpose: Give the other developer a clear, shareable audit of the pipeline's weaknesses; give the client a visual signal when images may be color-variant ambiguous; close two known filter gaps that let banner/logo images through.
Output: SCRIPT-AUDIT.md, updated enrichment schema + phase 2 script + adapter, updated frontend types + csv-loader + EnrichmentCard.
</objective>

<execution_context>
@/Users/jadieldossantos/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jadieldossantos/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/260320-dho-CONTEXT.md
@.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/260320-dho-RESEARCH.md
</context>

<interfaces>
<!-- Key types and contracts the executor needs. -->

From enrichment/src/types/noimg-enriched.ts (current):
```typescript
export const NoImgEnrichedFieldsSchema = z.object({
  // ... all fields ...
  confidence_score: z.enum(['high', 'medium', 'low', 'none']).optional(),
  source_url: z.string().optional(),
  match_reason: z.string().optional(),
  // ADD: image_confidence
})
export type NoImgEnrichedFields = z.infer<typeof NoImgEnrichedFieldsSchema>
```

From frontend/src/types/enrichment.ts (current ToolEnrichment interface):
```typescript
export interface ToolEnrichment {
  readonly imageLinks?: readonly string[]
  readonly sourceUrl?: string
  readonly confidenceScore?: string
  readonly matchReason?: string
  // ADD: imageConfidence?: 'verified' | 'variant_uncertain' | 'unverified'
}
```

From enrichment/src/scripts/enrich-noimg-phase2.ts — race condition location (lines 179–182):
```typescript
const verifiedUrls = imageUrls.length > 0 ? imageUrls : undefined
const newCompleted = { ...updatedProgress.completed, [sku]: verifiedUrls }  // stale snapshot
Object.assign(updatedProgress.completed, { [sku]: verifiedUrls })           // mutation (redundant)
savePhase2Progress({ completed: newCompleted })                              // writes stale snapshot
```

From enrichment/src/adapters/noimg-claude-adapter.ts — current isValidImageUrl filters:
```typescript
if (/(logo|favicon|sprite|social_sharing|spinner|spin_|widget|icon)/i.test(url)) return false
if (/(banner|nav[_-]|footer|editorial|blog|magazine|lookbook|placeholder|badge|payment|flag[_-]|shipping|return|...)/i.test(url)) return false
// Missing: case-insensitive "Header-" prefix pattern, short brand logo filenames (DG.png, YSL.png)
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Write SCRIPT-AUDIT.md</name>
  <files>.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md</files>
  <action>
Create SCRIPT-AUDIT.md in the quick task directory. Document every known issue found during research. No inline code comments or TODOs in the scripts — this file is the standalone report.

Structure the report as follows:

```
# Script Audit: enrich-noimg Pipeline

Audited: enrich-noimg.ts (Phase 1), enrich-noimg-phase2.ts (Phase 2), noimg-claude-adapter.ts (shared adapter)
Date: 2026-03-20

## Issues

### #1 — Race condition in Phase 2 checkpoint saves
**Severity:** Medium
**Location:** enrich-noimg-phase2.ts lines 179–182
**Description:** [exact failure mode from research — Worker A and B both read updatedProgress.completed at line 180 before either writes, last write wins and clobbers earlier concurrent writes. With CONCURRENCY=10 this is likely occurring every run. SKUs completed between a worker's read and write get dropped from the checkpoint.]
**Fix:** Replace the Object.assign mutation on the shared object with a write-lock pattern or move to a sequential checkpoint flush. Simplest safe fix: remove the Object.assign on line 181 entirely and use a mutex (or just serialize checkpoint writes with a per-sku Map that accumulates in-memory, flushed atomically after Promise.all completes).
**Note:** Object.assign on line 181 also violates the project's immutability rules — the mutation is redundant since newCompleted already captures the intent as a snapshot.

### #2 — isValidImageUrl: banner filter misses capital-H "Header-" prefix
**Severity:** Medium
**Location:** noimg-claude-adapter.ts isValidImageUrl()
**Description:** The URL https://d3adw1na09u8f7.cloudfront.net/2024/01/02193948/Header-CB-Made-In-Italy.jpg passes the banner filter because the regex /banner/i does not match the word "Header". Observed in 7+ products (SKUs 133299, 177728, 199942, 211049, 255478, 287757, 658702, 3898924, CHF5WG05.GLD).
**Fix:** Add /(?:^|[\/_-])header[\/_-]/i test to isValidImageUrl (catches Header-CB-Made-In-Italy.jpg and similar patterns). Implemented in Task 3.

### #3 — isValidImageUrl: logo filter misses short brand acronym filenames
**Severity:** Medium
**Location:** noimg-claude-adapter.ts isValidImageUrl()
**Description:** DG.png (Dolce & Gabbana logo from d3adw1na09u8f7.cloudfront.net) passes the logo filter because it doesn't contain the word "logo". Observed for SKUs 3850073 and 3898924.
**Fix:** Add a pattern for short (≤6 char) uppercase-only filenames with common brand acronyms, or more broadly: filenames that are 2–5 uppercase letters with optional single digit followed directly by .png/.jpg. Implemented in Task 3.

### #4 — verifyUrl uses GET not HEAD
**Severity:** Low
**Location:** noimg-claude-adapter.ts verifyUrl()
**Description:** Every URL verification downloads response headers + beginning of body before res.body.cancel(). With CONCURRENCY=10 and multiple candidates per product, this adds bandwidth overhead and may trigger rate limiting sooner on luxury CDNs (Kering DAM, Burberry assets.burberry.com). The GET approach is intentional — Shopify and many CDNs return 405 or incorrect status codes for HEAD requests, and the soft-redirect detection on res.url works equally well with HEAD. However, the bandwidth risk is real.
**Recommendation:** Accept as-is unless rate limiting becomes a problem. If it does: implement HEAD with GET fallback on 405.

### #5 — extractRelevantHtml caps at 10 img tags
**Severity:** Low
**Location:** noimg-claude-adapter.ts extractRelevantHtml() line 213
**Description:** imgTags.slice(0, 10) limits body img tag fallback to 10 tags. For sites without JSON-LD where site chrome (nav icons, logos) precedes product images in DOM order, the first 10 tags may be all noise. Observed as a near-miss for slowear.com (SKU 3921374) where exactly 10 images were returned. The Firecrawl fallback recovers most of these cases.
**Recommendation:** Increase to 20 or filter chrome images before the cap. Low priority — Firecrawl is an effective safety net.

### #6 — No overall timeout on Phase 2 Promise.all
**Severity:** Low
**Location:** enrich-noimg-phase2.ts lines 154–189
**Description:** The outer Promise.all has no AbortController or deadline. If a single worker hangs (e.g. a stalled Firecrawl request that bypasses the 15s fetchHtml timeout), the entire run waits indefinitely.
**Recommendation:** Wrap each concurrencyLimit worker in a Promise.race with a per-SKU timeout (e.g. 120s). Or rely on the existing per-fetch timeouts being sufficient.

### #7 — Silent failure when FIRECRAWL_API_KEY missing
**Severity:** Low
**Location:** noimg-claude-adapter.ts extractViaFirecrawl() lines 244–249
**Description:** Missing FIRECRAWL_API_KEY silently returns undefined with only a console.log. If the key is misconfigured, direct-fetch failures will fall through without Firecrawl backup and the operator has no clear signal that the fallback is disabled.
**Recommendation:** On startup (in enrich-noimg-phase2.ts), warn loudly if FIRECRAWL_API_KEY is not set: "FIRECRAWL_API_KEY not set — Firecrawl fallback disabled. Products requiring JS rendering will receive no images."

### #8 — deduplicateSizeVariants misses Farfetch and thewebster numeric size suffixes
**Severity:** Low
**Location:** noimg-claude-adapter.ts deduplicateSizeVariants()
**Description:** Handles named sizes (original/large/big/medium/small) but not Farfetch's _300/_1000 suffix pattern or thewebster's ?height=160&width=120 vs ?height=774&width=580 thumbnail duplication. Products 3937014 (Farfetch) and COCRWK01.BLK (thewebster) both have avoidable duplicate URLs in their phase 2 output.
**Recommendation:** Add Farfetch numeric suffix deduplication: group by path with trailing _NNN stripped, keep highest number. For thewebster: the existing isValidImageUrl width filter (≤200px) should already drop the small thumbnails — verify.

## Not-an-Issue Notes

- Kering DAM _F/_R/_D/_E shot codes: these are view angles of ONE product, not color variants. Correct behavior is to keep all of them.
- Giglio _1/_2/_3/_4/_5 view suffixes: same — view angles, not color variants.
- SFCC _0/_1/_5 view indices: same.
- Cloudinary truncated URL filter (/image/upload/...no-extension): already correctly handled by existing regex.
```
  </action>
  <verify>
    <automated>ls -la /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md</automated>
  </verify>
  <done>SCRIPT-AUDIT.md exists with all 8 issues (6 pipeline issues + 2 not-an-issue notes), each with severity, location, description, and recommendation.</done>
</task>

<task type="auto">
  <name>Task 2: Add image_confidence field to pipeline and frontend</name>
  <files>
    enrichment/src/types/noimg-enriched.ts,
    enrichment/src/scripts/enrich-noimg-phase2.ts,
    frontend/src/types/enrichment.ts,
    frontend/src/lib/csv-loader.ts,
    frontend/src/components/comparison/EnrichmentCard.tsx
  </files>
  <action>
**enrichment/src/types/noimg-enriched.ts**

Add `image_confidence` to `NoImgEnrichedFieldsSchema` after `match_reason`:

```typescript
image_confidence: z.enum(['verified', 'variant_uncertain', 'unverified']).optional(),
```

**enrichment/src/scripts/enrich-noimg-phase2.ts**

After the imageUrls are resolved (after the `verifyUrl` filtering block, line ~177), compute image_confidence and write it to the row before saving the checkpoint. Add a helper function `detectVariantConfidence` above `main()`:

```typescript
function detectVariantConfidence(
  imageUrls: readonly string[],
  color: string,
): 'verified' | 'variant_uncertain' | 'unverified' {
  if (imageUrls.length === 0) return 'unverified'

  // Check for sequential _00N variant patterns (e.g. _001, _002 — Shopify/Kering colorway variants)
  // _F/_R/_D/_E (Kering shot angles), _1/_2/_3 (Giglio views), _0/_1/_5 (SFCC views) are NOT variants
  const variantPattern = /_0[0-9]{2}[._]/
  const hasVariantUrls = imageUrls.filter((u) => variantPattern.test(u))
  const uniqueVariantSuffixes = new Set(
    hasVariantUrls.flatMap((u) => {
      const matches = u.match(/_0([0-9]{2})[._]/g) ?? []
      return matches
    }),
  )

  // Only flag as variant_uncertain if we see at least 2 distinct _00N suffixes
  // (i.e. _001 AND _002 exist, suggesting multiple colorways)
  const hasMultipleVariants = uniqueVariantSuffixes.size >= 2

  if (hasMultipleVariants && !color) return 'variant_uncertain'
  if (color) return 'verified'
  return 'unverified'
}
```

Then in the concurrencyLimit worker, after `imageUrls` is resolved and `row.image_links` is set, add:

```typescript
const imageConfidence = detectVariantConfidence(imageUrls, color)
row.image_confidence = imageConfidence
```

Also pass `image_confidence` to the progress save (the progress checkpoint only stores URLs, not confidence — that's correct, confidence is recomputed from the URLs on each run. No change to checkpoint format needed).

**frontend/src/types/enrichment.ts**

Add `imageConfidence` to the `ToolEnrichment` interface after `matchReason`:

```typescript
readonly imageConfidence?: 'verified' | 'variant_uncertain' | 'unverified'
```

**frontend/src/lib/csv-loader.ts**

In `buildToolEnrichment`, after the `matchReason` assignment, add:

```typescript
const rawImageConfidence = row['image_confidence']?.trim() || undefined
const imageConfidence =
  rawImageConfidence === 'verified' ||
  rawImageConfidence === 'variant_uncertain' ||
  rawImageConfidence === 'unverified'
    ? (rawImageConfidence as 'verified' | 'variant_uncertain' | 'unverified')
    : undefined
```

Add `imageConfidence` to the returned object.

**frontend/src/components/comparison/EnrichmentCard.tsx**

In the URL Discovery section (the `enrichment.confidenceScore || enrichment.matchReason || enrichment.sourceUrl` block), add the image confidence badge after the confidence score row and before the matchReason row. Only render it when `enrichment.imageConfidence` is `'verified'` or `'variant_uncertain'` (do NOT render for `'unverified'` or undefined):

```tsx
{enrichment.imageConfidence === 'verified' ? (
  <div className="flex items-start gap-3">
    <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
      Image Match
    </span>
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      verified
    </span>
  </div>
) : enrichment.imageConfidence === 'variant_uncertain' ? (
  <div className="flex items-start gap-3">
    <span className="w-28 shrink-0 text-xs font-medium text-gray-500">
      Image Match
    </span>
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Multiple variants — color unknown
    </span>
  </div>
) : null}
```

The badge lives inside the existing URL Discovery section. If there is no URL discovery section (no confidenceScore/matchReason/sourceUrl) but there IS an imageConfidence, the badge should still render — adjust the section's render condition to also check `enrichment.imageConfidence === 'verified' || enrichment.imageConfidence === 'variant_uncertain'`.
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment && npm run typecheck 2>&1 | tail -5 && cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/frontend && npm run build 2>&1 | tail -10</automated>
  </verify>
  <done>Both packages compile without errors. NoImgEnrichedFieldsSchema includes image_confidence. ToolEnrichment interface includes imageConfidence. csv-loader reads the field. EnrichmentCard renders green/amber badge based on value.</done>
</task>

<task type="auto">
  <name>Task 3: Fix two filter bugs in isValidImageUrl</name>
  <files>enrichment/src/adapters/noimg-claude-adapter.ts</files>
  <action>
In `isValidImageUrl()`, add two new filter clauses after the existing logo/favicon/sprite check (line 109) and before the banner/nav/footer check (line 111):

**Fix 1 — Case-insensitive "Header-" prefix (catches Header-CB-Made-In-Italy.jpg):**

Add to the banner/non-product regex. The existing banner regex already uses `/i` flag, but `banner` does not match `Header`. Extend the regex to also catch filenames that start with `Header-` (a clear banner/masthead signal). The cleanest fix is to add `header[_-]` to the existing banner pattern:

Current:
```typescript
if (/(banner|nav[_-]|footer|editorial|blog|magazine|lookbook|placeholder|badge|payment|flag[_-]|shipping|return|need_help|express_|easy_|star_|guarantee|trust|secure_|checkout)/i.test(url)) return false
```

Updated (add `header[_-]` to the banner group):
```typescript
if (/(banner|header[_-]|nav[_-]|footer|editorial|blog|magazine|lookbook|placeholder|badge|payment|flag[_-]|shipping|return|need_help|express_|easy_|star_|guarantee|trust|secure_|checkout)/i.test(url)) return false
```

This catches `Header-CB-Made-In-Italy.jpg` (the filename starts with `Header-`).

**Fix 2 — Short brand acronym filenames (catches DG.png, YSL.png, GG.png):**

Add a new filter clause after the banner check:

```typescript
// Exclude short all-caps brand acronym filenames (e.g. DG.png, YSL.png, GG.png) — these are logos
if (/\/[A-Z]{2,5}\d?\.(png|jpg|jpeg|svg|gif)$/i.test(url)) return false
```

This matches URLs ending in `/XX.png` or `/XXX.jpg` etc. where the filename is 2–5 uppercase letters with an optional digit. Pattern is anchored to `/` before the filename to avoid false positives on product codes that happen to be short (e.g. product page paths). Test cases:
- `https://d3adw1na09u8f7.cloudfront.net/2024/05/30201547/DG.png` → BLOCKED (correct)
- `https://cdn.example.com/products/MB0122S_001.png` → NOT blocked (correct — has underscore)
- `https://cdn.example.com/YSL.jpg` → BLOCKED (correct)
- `https://cdn.example.com/products/COCRWQ07.BLK_F.jpg` → NOT blocked (correct — has underscore + dot before the letters)

After both changes, run the enrichment tests to verify no regressions.
  </action>
  <verify>
    <automated>cd /Users/jadieldossantos/Developer/Lazer/product-enrichment-eval/enrichment && npm test 2>&1 | tail -20</automated>
  </verify>
  <done>
    Tests pass. isValidImageUrl blocks:
    - https://d3adw1na09u8f7.cloudfront.net/2024/01/02193948/Header-CB-Made-In-Italy.jpg (header- pattern)
    - https://d3adw1na09u8f7.cloudfront.net/2024/05/30201547/DG.png (short acronym pattern)
    Does NOT block: MB0122S_001.png, eCom-553680WHGP51070_F.jpg, PERCJU001VY0014_Black_01_1.jpg
  </done>
</task>

</tasks>

<verification>
After all tasks:

1. SCRIPT-AUDIT.md exists and is readable:
   `cat .planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/SCRIPT-AUDIT.md`

2. Enrichment package typechecks and tests pass:
   `cd enrichment && npm run typecheck && npm test`

3. Frontend builds clean:
   `cd frontend && npm run build`

4. isValidImageUrl blocks the two known bad URLs — can be verified manually or by adding unit tests for these specific URLs in the enrichment test suite.

5. image_confidence field is present in NoImgEnrichedFieldsSchema and ToolEnrichment interface — confirmed by typecheck passing.
</verification>

<success_criteria>
- SCRIPT-AUDIT.md documents all 8 issues (6 bugs/risks + 2 not-an-issue clarifications) with severity, location, description, and recommendation
- NoImgEnrichedFieldsSchema includes `image_confidence: z.enum(['verified', 'variant_uncertain', 'unverified']).optional()`
- Phase 2 script writes image_confidence to each CSV row using the detectVariantConfidence heuristic
- Frontend renders a green "verified" badge or amber "Multiple variants — color unknown" badge in the URL Discovery section, and nothing for unverified/missing
- Header-CB-Made-In-Italy.jpg and DG.png are blocked by isValidImageUrl
- All enrichment tests pass, frontend builds without TypeScript errors
- No changes to existing checkpoint format
</success_criteria>

<output>
After completion, create `.planning/quick/260320-dho-script-audit-and-variant-confidence-tagg/260320-dho-SUMMARY.md`
</output>

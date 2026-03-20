---
phase: 01-data-foundation
plan: 03
subsystem: data-pipeline
tags: [images, preflight, download, manifest, p-limit, streaming, HEAD-request]

# Dependency graph
requires:
  - phase: 01-data-foundation-01
    provides: ProductSchema, parseProductCSV, writeProductCSV
  - phase: 01-data-foundation-02
    provides: data/base.csv with 498 cleaned products and placeholder _has_images/_image_count
provides:
  - checkImageUrl with HEAD + GET fallback + 1 retry for URL reachability
  - runPreflight with p-limit concurrency checking all product image URLs
  - downloadImage streaming via pipeline(Readable.fromWeb, createWriteStream)
  - downloadAllImages with concurrency control and graceful error handling
  - readManifest/writeManifest for JSON image manifest I/O
  - extractExtension from URL pathname with .jpg default
  - cache-images CLI script orchestrating preflight + download + manifest + CSV update
  - data/images/ directory with 990 cached product images
  - data/image-manifest.json tracking 995 URLs with status, content-type, file size, local paths
  - Updated data/base.csv with accurate _has_images and _image_count (497 with images, 1 text-only)
affects: [02-enrichment-engine, 03-core-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [HEAD-then-GET-preflight, streaming-download-pipeline, manifest-driven-image-tracking, coerce-metadata-for-csv-roundtrip]

key-files:
  created:
    - enrichment/src/images/preflight.ts
    - enrichment/src/images/downloader.ts
    - enrichment/src/images/manifest.ts
    - enrichment/src/scripts/cache-images.ts
    - enrichment/src/images/__tests__/preflight.test.ts
    - enrichment/src/images/__tests__/downloader.test.ts
    - enrichment/src/images/__tests__/manifest.test.ts
    - data/images/
    - data/image-manifest.json
  modified:
    - enrichment/src/types/product.ts
    - enrichment/package.json
    - data/base.csv
    - .gitignore

key-decisions:
  - "Fixed ProductSchema metadata fields (_missing_fields, _has_images, _image_count) to use z.coerce/z.preprocess for CSV round-trip correctness"
  - "Added data/images/ and data/image-manifest.json to .gitignore (990 binary images should not be in git)"
  - "Preflight concurrency set to 15, download concurrency to 10 to balance speed vs server load"

patterns-established:
  - "HEAD-then-GET preflight: check URL reachability with HEAD, fall back to GET on 405, retry once on failure"
  - "Streaming download pipeline: fetch -> Readable.fromWeb -> createWriteStream via node:stream/promises pipeline"
  - "Manifest-driven image tracking: JSON manifest per URL tracks status, content-type, file size, and local path"
  - "Coerce metadata for CSV round-trip: use z.coerce and z.preprocess on metadata fields that lose type info through CSV serialization"

requirements-completed: [PIPE-02]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 1 Plan 03: Image Pre-flight and Caching Summary

**Image preflight checking 995 URLs with HEAD+GET fallback, streaming download of 990 reachable images to data/images/, manifest tracking all URLs, and base.csv updated with actual _has_images/_image_count (497 with images, 1 text-only)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-13T16:46:03Z
- **Completed:** 2026-03-13T16:54:25Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Preflight checked 995 image URLs: 990 reachable, 5 unreachable (HEAD + GET fallback + retry)
- 990 images downloaded to data/images/{sku}_{index}.{ext} via streaming pipeline
- Image manifest tracks all 995 URLs with status, content-type, file size, and local paths
- base.csv updated: 497 products have images (_has_images=true), 1 product is text-only
- Fixed ProductSchema metadata coercion enabling CSV round-trip without validation errors
- 84 total tests passing (24 new image module tests + 60 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Image preflight, downloader, and manifest modules** - `ba16ade` (feat, TDD)
2. **Task 2: cache-images CLI script and base.csv metadata update** - `61ad87e` (feat)

_Note: Task 1 followed TDD RED -> GREEN flow (tests written first, verified failing, then implementation)_

## Files Created/Modified
- `enrichment/src/images/preflight.ts` - checkImageUrl (HEAD+GET fallback+retry) and runPreflight (p-limit concurrency)
- `enrichment/src/images/downloader.ts` - downloadImage (streaming pipeline), downloadAllImages (concurrent with error handling), extractExtension
- `enrichment/src/images/manifest.ts` - ImageManifestEntry type, readManifest, writeManifest (JSON 2-space indent)
- `enrichment/src/scripts/cache-images.ts` - CLI orchestrator: parse CSV -> preflight -> download -> manifest -> update CSV
- `enrichment/src/images/__tests__/preflight.test.ts` - 8 tests: HEAD success, 405 fallback, retry, concurrency
- `enrichment/src/images/__tests__/downloader.test.ts` - 9 tests: extractExtension, streaming download, error handling
- `enrichment/src/images/__tests__/manifest.test.ts` - 4 tests: write/read round-trip, nested dirs, optional fields
- `enrichment/src/types/product.ts` - Added z.coerce/z.preprocess for _missing_fields, _has_images, _image_count
- `enrichment/package.json` - Added cache-images script
- `data/base.csv` - Updated with actual _has_images and _image_count values
- `data/images/` - 990 cached product images (gitignored)
- `data/image-manifest.json` - 995 entries tracking all URLs (gitignored)
- `.gitignore` - Added data/images/ and data/image-manifest.json

## Decisions Made
- Fixed ProductSchema metadata fields to use `z.coerce.number()` for `_missing_fields` and `_image_count`, and `z.preprocess` for `_has_images` (because `z.coerce.boolean()` in Zod v3 treats string "false" as truthy). This enables correct CSV round-tripping since all CSV values are strings.
- Added `data/images/` and `data/image-manifest.json` to `.gitignore` because 990 binary images (~hundreds of MB) and the manifest with absolute local paths should not be committed to git.
- Used concurrency of 15 for preflight and 10 for downloads to balance throughput against potential server rate limiting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ProductSchema metadata coercion for CSV round-trip**
- **Found during:** Task 2 (cache-images script)
- **Issue:** base.csv parsed 0 products with 498 validation errors because `_missing_fields` (z.number), `_has_images` (z.boolean), and `_image_count` (z.number) received CSV strings instead of typed values
- **Fix:** Changed `_missing_fields` and `_image_count` to `z.coerce.number()`, added `z.preprocess` for `_has_images` to correctly handle string "false"
- **Files modified:** enrichment/src/types/product.ts
- **Verification:** All 84 tests pass, base.csv parses 498 products with 0 errors
- **Committed in:** 61ad87e (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed data path resolution in cache-images script**
- **Found during:** Task 2 (cache-images script)
- **Issue:** Script resolved `../../data/base.csv` relative to `enrichment/src/scripts/` which pointed to `enrichment/data/` instead of project root `data/`
- **Fix:** Changed to `../../../data/base.csv` (three levels up from scripts dir to project root)
- **Files modified:** enrichment/src/scripts/cache-images.ts
- **Verification:** Script successfully loads 498 products from correct path
- **Committed in:** 61ad87e (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added data/images/ and image-manifest.json to .gitignore**
- **Found during:** Task 2 (post-download)
- **Issue:** 990 binary image files and manifest with absolute local paths would be committed to git without gitignore entries
- **Fix:** Added `data/images/` and `data/image-manifest.json` to .gitignore
- **Files modified:** .gitignore
- **Verification:** `git status` no longer shows data/images/ as untracked
- **Committed in:** 61ad87e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All fixes necessary for correctness and proper git hygiene. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- data/images/ contains 990 cached product images ready for LLM vision adapters in Phase 2
- data/image-manifest.json tracks all 995 URLs for adapter image selection
- base.csv _has_images and _image_count enable A/B grouping: 497 text+image vs 1 text-only
- Image modules (preflight, downloader, manifest) are importable for re-caching if needed
- All 84 tests passing, tsc --noEmit clean
- Phase 1 (Data Foundation) complete: schemas, parsers, cleaning, and image caching all delivered

## Self-Check: PASSED

All created files verified on disk. Both task commits (ba16ade, 61ad87e) verified in git log.

---
*Phase: 01-data-foundation*
*Completed: 2026-03-13*

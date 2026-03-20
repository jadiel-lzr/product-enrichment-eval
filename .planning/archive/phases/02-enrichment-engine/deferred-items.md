# Phase 02 Deferred Items

## Pre-existing TypeScript Errors

- `enrichment/src/adapters/firecrawl-adapter.ts` has TypeScript errors (scrapeUrl method, missing properties on types)
- `enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts` has PathLike type mismatch
- These are from a parallel plan and should be fixed in that plan's scope

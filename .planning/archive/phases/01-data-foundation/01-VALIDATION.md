---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | none -- Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PIPE-01 | unit | `npx vitest run src/parsers/__tests__/csv-reader.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | PIPE-01 | unit | `npx vitest run src/parsers/__tests__/json-columns.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | PIPE-01 | unit | `npx vitest run src/types/__tests__/product.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | PIPE-06 | unit | `npx vitest run src/cleaning/__tests__/filters.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | PIPE-06 | unit | `npx vitest run src/cleaning/__tests__/normalizers.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | PIPE-06 | unit | `npx vitest run src/cleaning/__tests__/report.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | PIPE-06 | unit | `npx vitest run src/cleaning/__tests__/cleaner.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PIPE-02 | integration | `npx vitest run src/images/__tests__/preflight.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | PIPE-02 | integration | `npx vitest run src/images/__tests__/downloader.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | PIPE-02 | unit | `npx vitest run src/images/__tests__/manifest.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `enrichment/vitest.config.ts` -- Vitest configuration with TypeScript
- [ ] `enrichment/src/parsers/__tests__/csv-reader.test.ts` -- covers PIPE-01 CSV parsing
- [ ] `enrichment/src/parsers/__tests__/json-columns.test.ts` -- covers PIPE-01 JSON parsing
- [ ] `enrichment/src/types/__tests__/product.test.ts` -- covers PIPE-01 schema validation
- [ ] `enrichment/src/cleaning/__tests__/filters.test.ts` -- covers PIPE-06 test product filtering
- [ ] `enrichment/src/cleaning/__tests__/normalizers.test.ts` -- covers PIPE-06 normalization
- [ ] `enrichment/src/cleaning/__tests__/report.test.ts` -- covers PIPE-06 reporting
- [ ] `enrichment/src/cleaning/__tests__/cleaner.test.ts` -- covers PIPE-06 metadata columns
- [ ] `enrichment/src/images/__tests__/preflight.test.ts` -- covers PIPE-02 HEAD checks
- [ ] `enrichment/src/images/__tests__/downloader.test.ts` -- covers PIPE-02 downloads
- [ ] `enrichment/src/images/__tests__/manifest.test.ts` -- covers PIPE-02 manifest
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Image URL reachability against live servers | PIPE-02 | Depends on external CDN availability | Run `node enrichment/src/images/preflight.ts` and verify output manifest |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

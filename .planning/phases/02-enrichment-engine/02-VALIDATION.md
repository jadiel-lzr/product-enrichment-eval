---
phase: 2
slug: enrichment-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `enrichment/vitest.config.ts` |
| **Quick run command** | `cd enrichment && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd enrichment && npx vitest run --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd enrichment && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd enrichment && npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ENRC-05 | unit | `cd enrichment && npx vitest run src/adapters/__tests__/ -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | ENRC-01, ENRC-06 | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/claude-adapter.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | ENRC-02, ENRC-06 | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/gemini-adapter.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | ENRC-03 | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/firecrawl-adapter.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | ENRC-04 | unit (mocked SDK) | `cd enrichment && npx vitest run src/adapters/__tests__/perplexity-adapter.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | PIPE-03, PIPE-05 | integration | `cd enrichment && npx vitest run src/batch/__tests__/runner.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | PIPE-04 | unit | `cd enrichment && npx vitest run src/batch/__tests__/checkpoint.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `enrichment/src/adapters/__tests__/claude-adapter.test.ts` — stubs for ENRC-01, ENRC-06
- [ ] `enrichment/src/adapters/__tests__/gemini-adapter.test.ts` — stubs for ENRC-02, ENRC-06
- [ ] `enrichment/src/adapters/__tests__/firecrawl-adapter.test.ts` — stubs for ENRC-03
- [ ] `enrichment/src/adapters/__tests__/perplexity-adapter.test.ts` — stubs for ENRC-04
- [ ] `enrichment/src/batch/__tests__/runner.test.ts` — stubs for PIPE-03, PIPE-05
- [ ] `enrichment/src/batch/__tests__/checkpoint.test.ts` — stubs for PIPE-04
- [ ] `enrichment/src/images/__tests__/resizer.test.ts` — stubs for image resize logic

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual API enrichment quality | ENRC-01-06 | Requires real API calls with real products | Run `--tool claude --limit 5` and visually inspect enriched CSV |
| Checkpoint resume after kill | PIPE-04 | Requires process interruption | Start batch, kill at ~50%, restart, verify no duplicates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

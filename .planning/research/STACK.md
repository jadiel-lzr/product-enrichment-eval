# Technology Stack

**Project:** Product Enrichment Evaluation
**Researched:** 2026-03-13

## Recommended Stack

### Runtime & Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 22.x LTS | Runtime | LTS with native .env support, ESM stable, required by Vite 7+ | HIGH |
| TypeScript | 5.9.x | Type safety | Latest stable; TS 6.0 is RC but not yet stable. 5.9 is battle-tested. | HIGH |
| tsx | 4.21.x | Script execution | Runs TS directly via esbuild. Zero config, no tsconfig needed for scripts. Faster than ts-node. | HIGH |

**Why not TypeScript 6.0?** TS 6.0 is in RC as of March 2026 and is the last JS-based release before the Go rewrite (TS 7). Stick with 5.9 for stability in a short-lived evaluation project.

**Why not native Node.js --strip-types?** Node 22 has experimental TS stripping, but tsx is more mature, handles ESM/CJS interop better, and supports watch mode out of the box.

---

### Enrichment API SDKs

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | ^0.78.0 | Claude API (LLM + Vision) | Official Anthropic SDK. First-class TS types, vision support via base64 image content blocks. | HIGH |
| @google/genai | ^1.44.0 | Gemini API (LLM + Vision) | New official Google SDK (replaces deprecated @google/generative-ai). GA since May 2025. Supports base64 inline image data. | HIGH |
| @mendable/firecrawl-js | ^4.15.0 | FireCrawl (Web Scraping) | Official SDK. Supports /v2/search and /v1/scrape endpoints needed for the existing enrichment strategy. | HIGH |
| openai | ^6.27.0 | Perplexity API (Search LLM) | Perplexity is OpenAI-compatible. Use the OpenAI SDK with `baseURL: "https://api.perplexity.ai"`. No need for a separate Perplexity package. | HIGH |
| apify-client | ^2.22.0 | Apify (Web Scraping) [stretch] | Official Apify client. Auto-retries, works in Node.js. Use pre-built e-commerce Actors via their REST API. | MEDIUM |
| serpapi | ^2.1.0 | SerpAPI Google Lens (URL Discovery) | Official SerpAPI client. Google Lens endpoint for visual product search. Returns product page URLs from image input. Used as a detached pre-enrichment step. | HIGH |

#### Model IDs to Use

| Provider | Model ID | Notes |
|----------|----------|-------|
| Anthropic | `claude-sonnet-4-5-20250929` | Best balance of quality/cost for enrichment. Vision-capable. |
| Google | `gemini-2.5-flash` | Fastest, cheapest multimodal in 2.5 family. Vision-capable. Budget-friendly for 500 products. |
| Perplexity | `sonar-pro` | Search-augmented LLM. Best for finding real product data on the web. |
| FireCrawl | N/A (API endpoints) | `/v2/search` for discovery, `/v1/scrape` for extraction. |

#### Important: Zyte Has No TypeScript SDK

Zyte's API is a plain REST endpoint (`POST https://api.zyte.com/v1/extract`). Use native `fetch()` with API key auth (HTTP Basic). No SDK needed -- just typed request/response interfaces.

---

### CSV Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| papaparse | ^5.5.3 | CSV parse/generate | De facto standard for CSV in JS/TS. Handles quoted fields, nested JSON in cells, streaming. Already proven in the existing product-middleware. | HIGH |
| @types/papaparse | ^5.3.16 | TS types for PapaParse | PapaParse doesn't ship its own types. | HIGH |

**Why not csv-parse/csv-stringify?** PapaParse handles both parsing and generation, works in browser AND Node.js (needed for both enrichment scripts and the React frontend), and the existing system already uses it. One library, two environments.

---

### Concurrency & Orchestration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| p-limit | ^7.3.0 | Concurrency control | Simple, well-maintained. Limits concurrent API calls per tool (3-5 concurrent). ESM-only but the project uses ESM anyway. | HIGH |

**Why not p-queue?** p-queue adds priority queuing, interval rate limiting, and event emitters -- overkill for this use case. p-limit does exactly one thing: limit concurrency. That is all we need.

**ESM Note:** p-limit v7 is ESM-only. The enrichment scripts must use `"type": "module"` in package.json and `"module": "Node16"` in tsconfig.json. This is fine -- the project is greenfield.

---

### Environment & Configuration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| dotenv | ^17.3.0 | Load .env files | Loads API keys from .env into process.env. Zero dependencies, TS types included. | HIGH |
| zod | ^4.3.0 | Runtime validation | Validate API responses (LLM JSON output), CSV row shapes, and environment variables. Zod 4 is 14x faster than v3 for string parsing. | HIGH |

**Why dotenv over native Node.js --env-file?** The `--env-file` flag works but is less flexible (no programmatic access to parse errors, no multi-file support). dotenv is a safer choice for the enrichment scripts where we need to validate that all API keys are present before running.

---

### Frontend - Core

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.2.x | UI framework | Latest stable. Project constraint specifies React. | HIGH |
| Vite | ^7.3.x | Build tool / dev server | Production-stable. Vite 8 released today (March 13, 2026) but is brand new -- use Vite 7 for stability. | HIGH |
| Tailwind CSS | ^4.2.0 | Styling | Zero-config with Vite plugin. No PostCSS needed in v4. 100x faster incremental builds. Utility-first is ideal for a comparison UI with many repeated card layouts. | HIGH |
| @tailwindcss/vite | ^4.2.0 | Vite integration | First-party Vite plugin. Replaces the old PostCSS setup. | HIGH |

**Why not Vite 8?** Vite 8.0.0 was released literally today. It replaces esbuild/Rollup with Rolldown/Oxc -- a major internal change. For a quick evaluation project, use the battle-tested Vite 7.3.x. Upgrade to 8 later if desired.

**Why Tailwind over a component library (MUI, Chakra, etc.)?** This project needs custom comparison cards, diff highlighting, and scoring panels -- not standard form UIs. A component library would fight the custom layout. Tailwind gives full control with minimal overhead.

---

### Frontend - Supporting

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| papaparse | ^5.5.3 | CSV loading in browser | Same library used in enrichment scripts. Parse CSVs fetched from `/data/` directory. | HIGH |
| zustand | ^5.x | State management | Lightweight (1KB), no boilerplate. Perfect for scoring state, filter state, selected product. Simpler than Redux, more capable than useState for cross-component state. | MEDIUM |

**Why zustand over Redux / Jotai / localStorage-only?**
- Redux: Massive boilerplate for a small app. Overkill.
- Jotai: Good but zustand's store pattern fits better for the scoring + filter state shape.
- localStorage-only: The PROJECT.md mentions localStorage for persistence, but we still need reactive state for the UI. zustand + a localStorage middleware gives both.

**Why no routing library?** The app is a single-page comparison tool. No routes needed. A product selector + filter bar handles navigation. Adding react-router would be overhead for zero benefit.

---

### Image Handling

No additional library needed. Use native `fetch()` + `Buffer.from(arrayBuffer).toString('base64')` for converting product image URLs to base64 for LLM vision APIs. This is 5 lines of code -- no library warranted.

```typescript
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  const data = Buffer.from(arrayBuffer).toString('base64')
  return { data, mediaType: contentType }
}
```

---

### Project Structure

**Do NOT use a monorepo tool.** The project has exactly two packages (enrichment scripts + frontend). npm workspaces adds complexity for zero benefit at this scale.

**Recommended structure:**
```
product-enrichment-eval/
  enrichment/          # TypeScript enrichment scripts
    package.json       # Independent package with API SDKs
    tsconfig.json
    src/
  frontend/            # React comparison UI
    package.json       # Independent package with React/Vite
    tsconfig.json
    src/
  data/                # Shared output directory (CSVs)
  package.json         # Root: no workspaces, just convenience scripts
```

The root `package.json` has convenience scripts like:
```json
{
  "scripts": {
    "enrich": "cd enrichment && npx tsx src/run.ts",
    "dev": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build"
  }
}
```

**Why no npm workspaces?** Two packages, no shared code between them (types are simple enough to duplicate or copy). Workspaces add hoisting complexity, phantom dependencies, and tooling friction. Keep it simple.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Google AI SDK | @google/genai | @google/generative-ai | Legacy package. Support ends August 2025. Already deprecated. |
| Perplexity client | openai (with baseURL) | @perplexity-ai/perplexity_ai | Extra dependency for same OpenAI-compatible API. openai SDK is well-typed and already battle-tested. |
| CSV parsing | papaparse | csv-parse + csv-stringify | Two packages vs one. PapaParse works in both Node.js and browser (needed for frontend). |
| Concurrency | p-limit | p-queue | p-queue adds priority/interval features we don't need. p-limit is simpler. |
| Styling | Tailwind CSS 4 | MUI / Chakra UI | Component libraries fight custom layouts. Comparison cards need bespoke design. |
| State management | zustand | Redux Toolkit | Redux boilerplate is excessive for a small evaluation tool. |
| TS execution | tsx | ts-node | tsx is faster (esbuild-based), zero-config, better ESM support. |
| Vite version | 7.3.x | 8.0.0 | Vite 8 released today -- too new for a production deliverable. |
| TypeScript version | 5.9.x | 6.0 RC | RC is not stable. Evaluation project needs reliability, not bleeding edge. |
| Project structure | Separate packages | npm workspaces / Turborepo | Overkill for 2 packages with no shared code. |
| Validation | zod 4 | yup / joi | Zod is TypeScript-first with static type inference. 14x faster in v4. |
| Monorepo tool | None | Turborepo / Nx | Two packages. No build orchestration needed. Plain scripts suffice. |

---

## Installation

### Enrichment Scripts

```bash
cd enrichment

# Core
npm install @anthropic-ai/sdk @google/genai @mendable/firecrawl-js openai

# URL discovery (SerpAPI Google Lens)
npm install serpapi

# Stretch tool clients
npm install apify-client

# Utilities
npm install papaparse dotenv zod p-limit

# Dev dependencies
npm install -D typescript @types/node @types/papaparse tsx
```

### Frontend

```bash
cd frontend

# Scaffold with Vite
npm create vite@7 . -- --template react-ts

# Styling
npm install tailwindcss @tailwindcss/vite

# Data loading & state
npm install papaparse zustand

# Dev dependencies
npm install -D @types/papaparse
```

### Root Convenience

```bash
# Root package.json (no dependencies, just scripts)
npm init -y
```

---

## TypeScript Configuration

### Enrichment Scripts (enrichment/tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"]
}
```

Key: `"module": "Node16"` is required for ESM-only packages like p-limit v7.

### Frontend (frontend/tsconfig.json)

Use the Vite scaffold default. It sets `"moduleResolution": "bundler"` which works with all npm packages regardless of ESM/CJS.

---

## Environment Variables

```bash
# enrichment/.env.example
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...
FIRECRAWL_API_KEY=fc-...
PERPLEXITY_API_KEY=pplx-...
SERPAPI_API_KEY=...                   # URL discovery (Google Lens)
APIFY_API_TOKEN=apify_api_...       # stretch
ZYTE_API_KEY=...                     # stretch
```

Validate at startup with Zod:

```typescript
import { z } from 'zod'

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  GOOGLE_AI_API_KEY: z.string().min(1),
  FIRECRAWL_API_KEY: z.string().min(1),
  PERPLEXITY_API_KEY: z.string().min(1),
  SERPAPI_API_KEY: z.string().optional(),  // Optional: only for URL discovery
  APIFY_API_TOKEN: z.string().optional(),
  ZYTE_API_KEY: z.string().optional(),
})

export const env = envSchema.parse(process.env)
```

---

## Version Summary

| Package | Version | Release Date | Status |
|---------|---------|-------------|--------|
| @anthropic-ai/sdk | 0.78.0 | Feb 2026 | Stable, active |
| @google/genai | 1.44.0 | Mar 2026 | GA, active |
| @mendable/firecrawl-js | 4.15.4 | Mar 2026 | Stable, active |
| openai | 6.27.0 | Mar 2026 | Stable, active |
| apify-client | 2.22.2 | Mar 2026 | Stable, active |
| papaparse | 5.5.3 | May 2025 | Stable, mature |
| p-limit | 7.3.0 | Feb 2026 | Stable, ESM-only |
| dotenv | 17.3.1 | Feb 2026 | Stable, mature |
| zod | 4.3.6 | Feb 2026 | Stable, v4 GA |
| React | 19.2.4 | Jan 2026 | Stable |
| Vite | 7.3.x | Jan 2026 | Stable, production |
| Tailwind CSS | 4.2.1 | Feb 2026 | Stable |
| TypeScript | 5.9.3 | Feb 2026 | Stable |
| tsx | 4.21.0 | Dec 2025 | Stable |
| zustand | 5.x | 2025 | Stable |

---

## Sources

- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) - v0.78.0
- [@google/genai on npm](https://www.npmjs.com/package/@google/genai) - v1.44.0, replaces deprecated @google/generative-ai
- [Google AI migration notice](https://ai.google.dev/gemini-api/docs/libraries) - @google/generative-ai EOL August 2025
- [@mendable/firecrawl-js on npm](https://www.npmjs.com/package/@mendable/firecrawl-js) - v4.15.4
- [Perplexity OpenAI Compatibility Guide](https://docs.perplexity.ai/guides/chat-completions-guide) - Use openai SDK with baseURL
- [Perplexity Sonar Quickstart](https://docs.perplexity.ai/docs/sonar/quickstart) - sonar-pro model
- [openai on npm](https://www.npmjs.com/package/openai) - v6.27.0
- [apify-client on npm](https://www.npmjs.com/package/apify-client) - v2.22.2
- [papaparse on npm](https://www.npmjs.com/package/papaparse) - v5.5.3
- [p-limit on npm](https://www.npmjs.com/package/p-limit) - v7.3.0, ESM-only
- [Vite Releases](https://vite.dev/releases) - v7.3.x stable, v8.0.0 released March 13 2026
- [React npm versions](https://www.npmjs.com/package/react?activeTab=versions) - v19.2.4
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) - v4.2.1
- [TypeScript npm](https://www.npmjs.com/package/typescript) - v5.9.3
- [tsx on npm](https://www.npmjs.com/package/tsx) - v4.21.0
- [Zod v4](https://zod.dev/v4) - v4.3.6
- [dotenv on npm](https://www.npmjs.com/package/dotenv) - v17.3.1
- [Zyte API Reference](https://docs.zyte.com/zyte-api/usage/reference.html) - REST-only, no TS SDK
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) - Base64 image support
- [Gemini Image Understanding](https://ai.google.dev/gemini-api/docs/image-understanding) - Base64 inline data
- [Claude Model Overview](https://platform.claude.com/docs/en/about-claude/models/overview) - claude-sonnet-4-5 model ID
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models) - gemini-2.5-flash model ID

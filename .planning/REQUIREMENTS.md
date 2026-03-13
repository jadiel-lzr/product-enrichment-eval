# Requirements: Product Enrichment Evaluation

**Defined:** 2026-03-13
**Core Value:** The client can visually compare enrichment quality across tools and make an informed decision on which approach to adopt.

## v1 Requirements

### Data Pipeline

- [x] **PIPE-01**: System parses source CSV into typed product objects with validated fields
- [x] **PIPE-06**: System cleans product data before enrichment (sanitize titles, normalize colors, filter test/placeholder products, parse embedded JSON fields, trim whitespace)
- [x] **PIPE-02**: System pre-validates image URLs and caches reachable images for LLM consumption
- [ ] **PIPE-03**: System runs each product through each enrichment adapter and outputs enriched CSV per tool
- [x] **PIPE-04**: System supports checkpoint/resume so batch runs survive crashes without losing progress or API credits
- [x] **PIPE-05**: System tracks enrichment metadata per product (fields enriched, status, errors)

### Enrichment Adapters

- [ ] **ENRC-01**: Claude adapter enriches products using Anthropic Messages API with vision (text + image)
- [ ] **ENRC-02**: Gemini adapter enriches products using Google GenAI API with vision (text + image)
- [ ] **ENRC-03**: FireCrawl adapter enriches products by searching brand sites and Google Shopping, then parsing page content; optionally uses SerpAPI-discovered URLs when available
- [ ] **ENRC-04**: Perplexity adapter enriches products using search-augmented LLM via OpenAI-compatible API
- [x] **ENRC-05**: All adapters implement a shared interface and fill the same 6 target fields (description_eng, season, year, collection, gtin, dimensions)
- [x] **ENRC-06**: LLM adapters include product images when available for multi-modal enrichment

### SerpAPI URL Discovery (DETACHED)

- [ ] **SERP-01**: SerpAPI Google Lens adapter takes a product image and returns ranked product page URLs from visual search
- [ ] **SERP-02**: URL discovery produces a manifest (`data/serpapi-urls.json`) mapping SKUs to discovered product page URLs with metadata (match confidence, result count)
- [ ] **SERP-03**: URL discovery supports checkpoint/resume for batch processing (same pattern as enrichment runner)

### Comparison UI

- [ ] **UI-01**: User can browse all products and select one to view detailed comparison
- [ ] **UI-02**: Selected product displays side-by-side cards (one per enrichment tool) showing enriched data
- [ ] **UI-03**: Enriched fields are visually highlighted to distinguish from original data
- [ ] **UI-04**: Product images from feed URLs are displayed on each card
- [ ] **UI-05**: User can filter products by brand, category, department, and enrichment completeness
- [ ] **UI-06**: User can rate each tool's enrichment quality per product (1-5 stars)
- [ ] **UI-07**: Scores persist to localStorage and survive page refresh
- [ ] **UI-08**: Aggregate dashboard shows overall scores per tool
- [ ] **UI-09**: Per-field winner analysis shows which tool is best at each field type
- [ ] **UI-10**: User can export scoring results as CSV
- [ ] **UI-11**: Weighted quality scores allow configurable field importance
- [ ] **UI-12**: Completeness metrics show fill rate per tool per field

## v2 Requirements

### Stretch Adapters

- **STRV-01**: Apify adapter enriches products using pre-built e-commerce scrapers
- **STRV-02**: Zyte adapter enriches products using AI-powered extraction API

### UI Enhancements

- **STRV-03**: Keyboard shortcuts for rapid bulk scoring navigation
- **STRV-04**: Cost-per-product comparison across tools
- **STRV-05**: Category heatmap showing tool performance by product category

## Out of Scope

| Feature | Reason |
|---------|--------|
| Describely adapter | No public API -- removed from scope entirely |
| Database integration | Standalone evaluation project, not production pipeline |
| Shopify sync | No publishing needed, just comparison |
| Image enrichment (finding better images) | Focus is on data field enrichment |
| Authentication | Internal/demo tool, no auth needed |
| Real-time enrichment in UI | Enrichment runs as CLI batch, not on-demand |
| Automated accuracy scoring | Requires ground truth data we don't have |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 | Complete |
| PIPE-06 | Phase 1 | Complete |
| PIPE-02 | Phase 1 | Complete |
| PIPE-03 | Phase 2 | Pending |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| ENRC-01 | Phase 2 | Pending |
| ENRC-02 | Phase 2 | Pending |
| ENRC-03 | Phase 2 | Pending |
| ENRC-04 | Phase 2 | Pending |
| ENRC-05 | Phase 2 | Complete |
| ENRC-06 | Phase 2 | Complete |
| SERP-01 | Phase 5 (DETACHED) | Pending |
| SERP-02 | Phase 5 (DETACHED) | Pending |
| SERP-03 | Phase 5 (DETACHED) | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 3 | Pending |
| UI-08 | Phase 4 | Pending |
| UI-09 | Phase 4 | Pending |
| UI-10 | Phase 4 | Pending |
| UI-11 | Phase 4 | Pending |
| UI-12 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 27 total (24 core + 3 SerpAPI)
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*

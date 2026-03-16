# Analysis Dashboard — Scoring & Methodology

This document explains how the analysis page works: what each section shows, how scores are calculated, and what the weight presets do.

---

## Overview

The analysis page provides an aggregated comparison of enrichment tools across all products. It answers: **which tool fills the most fields, with the highest quality, for the fields that matter most?**

It does NOT evaluate content quality (e.g. whether a description is factually accurate). Content quality must be reviewed manually in the comparison view. The analysis page measures **coverage** (did the tool fill the field?) and **self-reported confidence** (how sure was the LLM?).

---

## Score Tracks

Tools are split into two scoring tracks to avoid unfair comparison:

| Track | Tools | Why |
|-------|-------|-----|
| **Confidence** | Claude, Gemini, GPT | These LLMs return an `accuracy_score` (1-10) representing how confident they are in their enrichment |
| **No-confidence** | FireCrawl | Web scraping tools don't self-report confidence — scoring is based purely on field coverage |

This prevents a scraping tool with 100% fill rate from outranking an LLM that left uncertain fields blank (which is the correct behavior for factual fields).

---

## Sections

### 1. Executive Summary

Auto-generated takeaways based on the data:

- Which tool leads the confidence track
- Which tool leads the no-confidence track
- How many fields are "too close to call" between tools
- Whether the filtered view changes the leader vs the full dataset

### 2. Tool Rankings

Each tool gets a **blended score** that combines quality and completeness.

#### Confidence track formula (Claude, Gemini, GPT)

```
blendedScore = weightedQualityScore * 0.7 + completenessScore * 0.3
```

Where:
- `weightedQualityScore` = average across products of: `(accuracy_score / 10) * weighted_fill_rate`
- `completenessScore` = total fields filled / (total products * 12 fields)
- `weighted_fill_rate` = sum of weights for filled fields / total weight

This means a tool that fills fewer fields but with high confidence can score comparably to a tool that fills everything but with low confidence.

#### No-confidence track formula (FireCrawl)

```
blendedScore = weightedFillRate * 0.85 + completenessScore * 0.15
```

Without confidence data, the score relies more heavily on weighted fill rate. Completeness still contributes 15% to reward broad coverage.

#### Ranking tiebreakers

1. Higher `blendedScore` wins
2. If tied: higher `completenessScore` wins
3. If still tied: alphabetical by tool name

### 3. Field Winners

For each of the 12 enrichment fields, this section shows which tool "wins" that field.

**How it works:**

1. For each field, calculate the **coverage ratio** per tool: what % of products had that field filled by this tool
2. Multiply the coverage ratio by the field's **weight** from the active preset
3. The tool with the highest weighted coverage wins that field
4. If the margin between the top two tools is less than **5%** (the `meaningfulLeadThreshold`), the field is marked **"too close to call"**

Example: If Claude fills `title` for 480/500 products (96%) and Gemini fills it for 470/500 (94%), and the title weight is 1.4:
- Claude: `0.96 * 1.4 = 1.344`
- Gemini: `0.94 * 1.4 = 1.316`
- Margin: `0.028` — less than 0.05, so **too close to call**

Changing the weight preset directly affects which tool wins each field.

### 4. Completeness Matrix

A raw fill rate heatmap with **no weighting**. For each tool and field:

```
fillRate = products_with_field_filled / total_products
```

This gives a pure view of coverage without any scoring bias. Useful for spotting fields that a tool consistently misses (e.g. `weight` or `dimensions` are hard for all tools).

The overall fill rate per tool is:

```
overallFillRate = total_fields_filled / (total_products * 12)
```

---

## Weight Presets

Weights control how much each field contributes to the rankings and field winner calculations. Higher weight = more influence on the score.

### Balanced (default)

All fields weighted equally at `1.0`. No field is more important than another.

| Field | Weight |
|-------|--------|
| title | 1.0 |
| description_eng | 1.0 |
| season | 1.0 |
| year | 1.0 |
| collection | 1.0 |
| gtin | 1.0 |
| dimensions | 1.0 |
| made_in | 1.0 |
| materials | 1.0 |
| weight | 1.0 |
| color | 1.0 |
| additional_info | 1.0 |

### Accuracy First

Prioritizes fields that affect SEO, compliance, and product identity. Title and description get the highest weight since they're the most customer-facing and searchability-critical.

| Field | Weight | Rationale |
|-------|--------|-----------|
| title | 1.4 | Most important for SEO/searchability |
| description_eng | 1.4 | Key narrative field |
| gtin | 1.3 | Compliance/identification |
| materials | 1.2 | Product accuracy |
| made_in | 1.1 | Origin compliance |
| dimensions | 1.0 | Standard |
| collection | 0.9 | Nice to have |
| color | 0.9 | Usually available in feed |
| weight | 0.9 | Often missing from all tools |
| season | 0.8 | Often pre-filled |
| year | 0.8 | Often pre-filled |
| additional_info | 0.7 | Supplementary |

### Completeness First

Emphasizes broad catalog coverage — rewarding tools that fill the most fields across the most products, including harder-to-find fields.

| Field | Weight | Rationale |
|-------|--------|-----------|
| season | 1.2 | Catalog readiness |
| year | 1.2 | Catalog readiness |
| collection | 1.2 | Catalog readiness |
| weight | 1.2 | Hard to find, high value when present |
| title | 1.1 | Important but usually available |
| dimensions | 1.1 | Hard to find |
| made_in | 1.1 | Moderate difficulty |
| materials | 1.1 | Moderate difficulty |
| color | 1.1 | Usually available |
| description_eng | 1.0 | Standard |
| additional_info | 1.0 | Standard |
| gtin | 0.9 | Often pre-filled |

### Manual Overrides

Users can manually adjust individual field weights on top of any preset. Manual overrides take precedence over the preset value for that specific field.

---

## Filtering

The analysis page respects the sidebar filters (brand, category, department, search). When filters are active:

- **Full dataset rankings** still show scores across all 500 products
- **Filtered slice rankings** show scores for only the filtered products
- **Field winners** and **completeness matrix** use the filtered products
- If the filtered slice changes the leader, this is called out in the executive summary

This lets you ask questions like "which tool is best for Gucci products?" or "which tool handles the Bags category best?"

---

## Data Export

The export button generates a CSV with all analysis data:

- Rankings per scope (full dataset + filtered slice)
- Field winners with margins
- Completeness fill rates per tool per field
- Active weight configuration

---

## Limitations

- **No content quality evaluation**: The analysis measures coverage (did the tool fill the field?) and confidence (how sure was the LLM?), but not accuracy (is the content correct?). A tool could fill every field with hallucinated data and still score high. Content accuracy must be reviewed manually in the comparison view.
- **Self-reported confidence is subjective**: The `accuracy_score` is what the LLM thinks about its own output. It's useful as a relative signal between tools, but not an absolute measure of quality.
- **FireCrawl is in a separate track**: Because FireCrawl doesn't return confidence scores, it can't be directly compared to LLMs in the rankings. The completeness matrix is the best place to compare all tools on equal footing.
- **Weights are human-defined**: The preset weights reflect business priorities (SEO, compliance, catalog readiness) but are not derived from data. Adjust them based on your team's needs.

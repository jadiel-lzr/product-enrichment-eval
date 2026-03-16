"""
enrich_firecrawl_extract.py

Reads data/base.csv, calls the Firecrawl v1 extract API on the
best product links for each row, and fills in empty enrichable fields.

Output format matches the enrich.ts pipeline (enriched-{tool}.csv convention):
  - All base.csv columns preserved
  - 12 enriched field values written directly into their columns
  - 6 standard metadata columns appended

Firecrawl extract is async: POST /v1/extract returns a job ID, then we poll
GET /v1/extract/{id} until status == "completed" or "failed".

Resume-safe: already-processed SKUs in the output file are skipped.

Install:
    pip install requests python-dotenv

Usage:
    cd enrichment && python src/scripts/enrich_firecrawl_extract.py
    cd enrichment && python src/scripts/enrich_firecrawl_extract.py --concurrency 10
"""

import argparse
import csv
import json
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY")
if not FIRECRAWL_API_KEY:
    raise EnvironmentError("FIRECRAWL_API_KEY not set in environment")

csv.field_size_limit(sys.maxsize)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent  # enrichment/src/scripts -> repo root
INPUT_CSV = REPO_ROOT / "data" / "base.csv"
OUTPUT_CSV = REPO_ROOT / "data" / "enriched-firecrawl.csv"

API_BASE = "https://api.firecrawl.dev/v1"
MAX_POLLING_ATTEMPTS = 90
POLLING_INTERVAL_S = 2.0
ROW_SLEEP_S = 0.5
NO_VALID_LINKS = "no valid links"
DEFAULT_CONCURRENCY = 5

TOOL_NAME = "firecrawl"

# Fields to always re-extract even if already populated
ALWAYS_EXTRACT = {"title", "made_in"}

# 12 target fields matching ENRICHMENT_TARGET_FIELDS in enriched.ts
ENRICHMENT_TARGET_FIELDS = [
    "title",
    "description_eng",
    "season",
    "year",
    "collection",
    "gtin",
    "dimensions",
    "made_in",
    "materials",
    "weight",
    "color",
    "additional_info",
]

FIELD_DESCRIPTIONS = {
    "title": (
        "Product name or title in English. Check: visible heading/title, <title> tag, "
        "og:title meta tag, JSON-LD 'name' field. "
        "If the title is in a non-English language, translate it to English. "
        "Return null if not found."
    ),
    "description_eng": (
        "Full product description in English focusing ONLY on the product itself. "
        "Check: visible description text, <meta name='description'>, og:description meta tag, "
        "JSON-LD 'description' field, any product details or 'About this item' section. "
        "Return the most complete version found. "
        "EXCLUDE all retailer/marketplace marketing: store names, discount percentages, "
        "sale events, pricing, shipping info, promotional language (e.g., 'up to X% off', "
        "'exclusive sale', 'unbeatable prices', 'free shipping'). "
        "EXCLUDE 'Made in [country]' info — that belongs in the made_in field, not here. "
        "Only include text that describes the product's features, design, fit, or craftsmanship. "
        "Return null if only marketing text is found with no actual product description."
    ),
    "season": (
        "Fashion season (e.g., SS25, FW25, AW24, Spring/Summer 2025). "
        "Check: product details section, tags, breadcrumbs, JSON-LD, meta tags. "
        "Return null if not found — do NOT guess from product name."
    ),
    "year": (
        "Collection year as a 4-digit number (e.g., 2025). "
        "Check: product details, tags, JSON-LD. "
        "Return null if not found — do NOT infer from current date."
    ),
    "collection": (
        "Collection name (e.g., Spring/Summer 2025, Resort 2024). "
        "Check: product details, breadcrumbs, tags. Return null if not found."
    ),
    "gtin": (
        "GTIN, EAN, or UPC barcode (typically 13 digits). "
        "Check: JSON-LD 'gtin', 'gtin13', 'gtin8', 'ean' fields; "
        "product:ean or product:isbn meta tags; visible barcode label. "
        "Return null if not found — do NOT generate or guess a barcode."
    ),
    "dimensions": (
        "Product dimensions (e.g., 25x15x8 cm, W30 x H20 x D10 cm). "
        "Check: product details/specs table, JSON-LD. Return null if not found."
    ),
    "made_in": (
        "Country of manufacture. "
        "Check: 'Made in', 'Country of origin', 'Fabricated in' labels; "
        "JSON-LD 'countryOfOrigin'; product details/specs table. "
        "Return just the country name (e.g., Italy). Return null if not found."
    ),
    "materials": (
        "Material or fabric composition (e.g., 100% Cotton, 80% Wool 20% Nylon). "
        "Check: 'Composition', 'Material', 'Fabric', 'Content' labels; "
        "JSON-LD 'material'; product details/specs table. Return null if not found."
    ),
    "weight": (
        "Product weight (e.g., 800g, 1.2kg). "
        "Check: product specs/details table, JSON-LD 'weight'. Return null if not found."
    ),
    "color": (
        "Product color name (e.g., Black, Navy Blue, Burgundy). "
        "Check: color selector, product details/specs, JSON-LD 'color' field, "
        "meta tags. Return null if not found."
    ),
    "additional_info": (
        "Any supplementary product details not covered by other fields "
        "(e.g., care instructions, special features, fit notes, design details). "
        "Check: product details section, care labels, feature lists. "
        "EXCLUDE all retailer/logistics info: available sizes, shipping costs, "
        "delivery estimates, return/exchange policies, stock availability, "
        "pricing, and any promotional or marketplace-specific text. "
        "Only include information intrinsic to the product itself. "
        "Return null if only retailer info is found with no actual product details."
    ),
}

# 6 standard metadata columns matching enrich.ts output
METADATA_COLUMNS = [
    "_enrichment_tool",
    "_enrichment_status",
    "_enrichment_fill_rate",
    "_enriched_fields",
    "_enrichment_error",
    "_enrichment_accuracy_score",
]

HEADERS = {
    "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
    "Content-Type": "application/json",
}


# ── Result type ──────────────────────────────────────────────────────────────

@dataclass
class RowResult:
    out_row: dict
    status: str  # "success" | "skipped" | "failed" | "no_data"
    credits: int = 0
    tokens: int = 0


# ── Fill rate & status ────────────────────────────────────────────────────────

def compute_fill_rate(row: dict) -> float:
    """Count how many of the 12 target fields have non-empty values, divided by 12."""
    filled = sum(
        1 for f in ENRICHMENT_TARGET_FIELDS
        if row.get(f, "").strip()
    )
    return round(filled / len(ENRICHMENT_TARGET_FIELDS), 2)


def derive_status(fill_rate: float, has_error: bool) -> str:
    """Derive enrichment status matching enrich.ts convention."""
    if has_error:
        return "failed"
    if fill_rate == 1.0:
        return "success"
    if fill_rate > 0:
        return "partial"
    return "failed"


# ── Firecrawl API calls ──────────────────────────────────────────────────────

def create_extract_job(
    url: str, empty_fields: list[str], brand: str,
) -> tuple[bool, Optional[str], Optional[str]]:
    """
    POST /v1/extract — create an async extraction job.
    Returns (success, job_id, error_message).
    """
    schema_properties = {
        f: {"type": "string", "description": FIELD_DESCRIPTIONS[f]}
        for f in empty_fields
        if f in FIELD_DESCRIPTIONS
    }

    payload = {
        "urls": [url],
        "prompt": (
            f"Extract product details for a luxury fashion item"
            f"{f' by {brand}' if brand else ''}. "
            "Look in ALL available sources: visible page text, HTML meta tags "
            "(<meta name='description'>, og:title, og:description, product:ean, etc.), "
            "JSON-LD structured data (<script type='application/ld+json'>), "
            "Schema.org markup, and product details/specs tables. "
            "ONLY return values that are explicitly present in the page content or its metadata — "
            "do NOT infer, guess, or fabricate any values. "
            "If a field is not clearly present anywhere on the page, return null for that field. "
            "IMPORTANT: Strip out ALL retailer/marketplace noise from extracted text — "
            "do NOT include store names, competitor brand names, discount percentages, "
            "sale/promotion language, pricing, shipping details, or any marketing copy. "
            "Return only factual product information (features, materials, design, fit, craftsmanship)."
        ),
        "schema": {
            "type": "object",
            "properties": schema_properties,
        },
        "scrapeOptions": {
            "waitFor": 5000,
            "formats": ["markdown", "html"],
        },
    }

    try:
        resp = requests.post(
            f"{API_BASE}/extract",
            headers=HEADERS,
            json=payload,
            timeout=30,
        )
        if not resp.ok:
            return False, None, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not data.get("success"):
            return False, None, data.get("error", "Job creation failed")
        return True, data.get("id"), None
    except Exception as e:
        return False, None, str(e)


def poll_extract_job(
    job_id: str,
) -> tuple[bool, Optional[dict], Optional[str], int, int]:
    """
    Poll GET /v1/extract/{id} until completed or failed.
    Returns (success, extracted_data, error_message, credits_used, tokens_used).
    """
    for attempt in range(1, MAX_POLLING_ATTEMPTS + 1):
        try:
            resp = requests.get(
                f"{API_BASE}/extract/{job_id}",
                headers={"Authorization": f"Bearer {FIRECRAWL_API_KEY}"},
                timeout=15,
            )
            if not resp.ok:
                return False, None, f"Polling HTTP {resp.status_code}: {resp.text[:200]}", 0, 0
            data = resp.json()
            status = data.get("status")

            if status == "completed":
                credits = data.get("creditsUsed", 0) or 0
                tokens = data.get("tokensUsed", 0) or 0
                return True, data.get("data"), None, credits, tokens
            if status == "failed":
                return False, None, data.get("error", "Job failed"), 0, 0

            time.sleep(POLLING_INTERVAL_S)

        except Exception as e:
            if attempt == MAX_POLLING_ATTEMPTS:
                return False, None, f"Polling error after {attempt} attempts: {e}", 0, 0
            time.sleep(POLLING_INTERVAL_S)

    timeout_s = MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_S
    return False, None, f"Timeout: job did not complete within {int(timeout_s)}s", 0, 0


# ── Resume helpers ────────────────────────────────────────────────────────────

def load_completed_skus() -> set[str]:
    if not OUTPUT_CSV.exists() or OUTPUT_CSV.stat().st_size == 0:
        return set()
    completed: set[str] = set()
    try:
        with open(OUTPUT_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                sku = row.get("sku", "").strip()
                if sku:
                    completed.add(sku)
    except Exception as e:
        print(f"Warning: could not read output file ({e}). Starting fresh.")
    return completed


# ── Per-row processing (runs in thread) ──────────────────────────────────────

def process_row(row: dict, row_index: int, total: int) -> RowResult:
    """Process a single row: extract from Firecrawl, return result."""
    sku = row.get("sku", "?")
    brand = row.get("brand", "").strip()
    best_links_raw = row.get("best_product_links", "").strip()
    prefix = f"[{row_index}/{total}] SKU {sku}"

    # Find empty enrichable fields + always re-extract certain fields
    empty_fields = [
        f for f in ENRICHMENT_TARGET_FIELDS
        if not row.get(f, "").strip() or f in ALWAYS_EXTRACT
    ]

    if not empty_fields:
        print(f"{prefix} — no empty fields, skipping")
        fill_rate = compute_fill_rate(row)
        return RowResult(
            out_row={
                **row,
                "_enrichment_tool": TOOL_NAME,
                "_enrichment_status": derive_status(fill_rate, False),
                "_enrichment_fill_rate": fill_rate,
                "_enriched_fields": "",
                "_enrichment_error": "",
                "_enrichment_accuracy_score": "",
            },
            status="skipped",
        )

    if best_links_raw == NO_VALID_LINKS or not best_links_raw:
        print(f"{prefix} — no valid links, skipping enrichment")
        fill_rate = compute_fill_rate(row)
        return RowResult(
            out_row={
                **row,
                "_enrichment_tool": TOOL_NAME,
                "_enrichment_status": derive_status(fill_rate, True),
                "_enrichment_fill_rate": fill_rate,
                "_enriched_fields": "",
                "_enrichment_error": "No valid links available",
                "_enrichment_accuracy_score": "",
            },
            status="skipped",
        )

    # Parse all candidate URLs
    try:
        links_data = json.loads(best_links_raw)
        candidate_urls = [item["link"] for item in links_data if item.get("link")]
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"{prefix} — could not parse best_product_links: {e}")
        fill_rate = compute_fill_rate(row)
        return RowResult(
            out_row={
                **row,
                "_enrichment_tool": TOOL_NAME,
                "_enrichment_status": "failed",
                "_enrichment_fill_rate": fill_rate,
                "_enriched_fields": "",
                "_enrichment_error": f"Parse error: {e}",
                "_enrichment_accuracy_score": "",
            },
            status="failed",
        )

    if not candidate_urls:
        print(f"{prefix} — best_product_links parsed but no URLs found")
        fill_rate = compute_fill_rate(row)
        return RowResult(
            out_row={
                **row,
                "_enrichment_tool": TOOL_NAME,
                "_enrichment_status": derive_status(fill_rate, True),
                "_enrichment_fill_rate": fill_rate,
                "_enriched_fields": "",
                "_enrichment_error": "No URLs in best_product_links",
                "_enrichment_accuracy_score": "",
            },
            status="skipped",
        )

    # Try each link in order, accumulating fills across all links
    filled_fields: list[str] = []
    out_row = dict(row)
    last_err: Optional[str] = None
    remaining_fields = list(empty_fields)
    row_credits = 0
    row_tokens = 0

    for link_idx, url in enumerate(candidate_urls):
        if not remaining_fields:
            break

        print(f"{prefix} — link {link_idx + 1}/{len(candidate_urls)}: extracting {remaining_fields} from {url}")

        ok, job_id, err = create_extract_job(url, remaining_fields, brand)
        if not ok:
            print(f"{prefix} — job creation failed: {err}")
            last_err = err or "job creation failed"
            time.sleep(ROW_SLEEP_S)
            continue

        print(f"{prefix} — job {job_id}, polling...")
        ok, extracted, err, credits, tokens = poll_extract_job(job_id)
        row_credits += credits
        row_tokens += tokens
        if credits or tokens:
            print(f"{prefix} — credits: {credits}, tokens: {tokens}")
        if not ok:
            print(f"{prefix} — extraction failed: {err}")
            last_err = err or "extraction failed"
            time.sleep(ROW_SLEEP_S)
            continue

        if extracted:
            link_fills: list[str] = []
            for f in list(remaining_fields):
                value = extracted.get(f)
                if value and str(value).strip():
                    out_row[f] = str(value).strip()
                    link_fills.append(f)
                    remaining_fields.remove(f)
            if link_fills:
                filled_fields.extend(link_fills)
                print(f"{prefix} — filled from link {link_idx + 1}: {link_fills} (still needed: {remaining_fields})")
            else:
                print(f"{prefix} — link {link_idx + 1} returned no usable data, trying next...")
        else:
            print(f"{prefix} — link {link_idx + 1} returned no usable data, trying next...")

        time.sleep(ROW_SLEEP_S)

    # Compute metadata
    fill_rate = compute_fill_rate(out_row)
    has_error = not filled_fields and last_err is not None
    out_row["_enrichment_tool"] = TOOL_NAME
    out_row["_enrichment_status"] = derive_status(fill_rate, has_error)
    out_row["_enrichment_fill_rate"] = fill_rate
    out_row["_enriched_fields"] = ",".join(filled_fields)
    out_row["_enrichment_error"] = last_err if has_error else ""
    out_row["_enrichment_accuracy_score"] = ""

    if filled_fields:
        status = "success"
    else:
        print(f"{prefix} — all links exhausted, no usable data")
        status = "no_data"

    return RowResult(
        out_row=out_row,
        status=status,
        credits=row_credits,
        tokens=row_tokens,
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich products via Firecrawl extract API",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Maximum number of rows to process",
    )
    parser.add_argument(
        "--concurrency", type=int, default=DEFAULT_CONCURRENCY,
        help=f"Number of rows to process in parallel (default: {DEFAULT_CONCURRENCY})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print(f"Reading {INPUT_CSV}...")
    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        all_rows = list(reader)
    print(f"Loaded {len(all_rows)} rows.")

    completed_skus = load_completed_skus()
    if completed_skus:
        print(f"Resuming: {len(completed_skus)} rows already processed.")

    pending_rows = [r for r in all_rows if r.get("sku", "").strip() not in completed_skus]

    if args.limit is not None:
        pending_rows = pending_rows[:args.limit]
        print(f"Limiting to {len(pending_rows)} rows")

    print(f"Rows to process: {len(pending_rows)}")
    print(f"Concurrency: {args.concurrency}")

    if not pending_rows:
        print("Nothing to do.")
        return

    # Ensure enriched field columns exist in fieldnames
    for f in ENRICHMENT_TARGET_FIELDS:
        if f not in fieldnames:
            fieldnames.append(f)

    # Ensure metadata columns exist in fieldnames
    for col in METADATA_COLUMNS:
        if col not in fieldnames:
            fieldnames.append(col)

    file_exists = OUTPUT_CSV.exists() and OUTPUT_CSV.stat().st_size > 0
    mode = "a" if file_exists else "w"

    success_count = 0
    skipped_count = 0
    failed_count = 0
    no_data_count = 0
    total_credits = 0
    total_tokens = 0

    write_lock = threading.Lock()
    total = len(pending_rows)

    with open(OUTPUT_CSV, mode, newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()

        def on_result(result: RowResult) -> None:
            nonlocal success_count, skipped_count, failed_count, no_data_count
            nonlocal total_credits, total_tokens

            with write_lock:
                writer.writerow(result.out_row)
                out_f.flush()

                total_credits += result.credits
                total_tokens += result.tokens

                if result.status == "success":
                    success_count += 1
                elif result.status == "skipped":
                    skipped_count += 1
                elif result.status == "failed":
                    failed_count += 1
                elif result.status == "no_data":
                    no_data_count += 1

        with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            futures = {
                executor.submit(process_row, row, i, total): i
                for i, row in enumerate(pending_rows, 1)
            }

            for future in as_completed(futures):
                row_idx = futures[future]
                try:
                    result = future.result()
                    on_result(result)
                except Exception as e:
                    print(f"[{row_idx}/{total}] — unexpected error: {e}")
                    failed_count += 1

    print(f"\nDone. {total} rows processed.")
    print(f"  success:          {success_count}")
    print(f"  no_data:          {no_data_count}")
    print(f"  failed:           {failed_count}")
    print(f"  skipped:          {skipped_count}")
    print(f"  total credits:    {total_credits}")
    print(f"  total tokens:     {total_tokens}")
    print(f"Output: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()

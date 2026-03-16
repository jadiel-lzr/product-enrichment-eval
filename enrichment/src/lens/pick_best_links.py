"""
pick_best_links.py

Scores and validates candidate product links from lens_brand_matches (priority)
and lens_all_matches (fallback) in data/base.csv, then writes the top working
URLs back into a best_product_links column.

Validation is three-stage:
  1. HEAD/GET — confirms the URL is reachable (not 404/410/etc.)
  2. Content scan — fetches body and checks for "unavailable" text patterns
  3. Playwright — for JS-heavy domains, renders the page and checks visible text

Resume-safe: rows that already have best_product_links are skipped.

Usage:
    cd enrichment && npm run pick-best-links

Install deps:
    pip install aiohttp tqdm playwright
    playwright install chromium
"""

import asyncio
import csv
import json
import os
import random
import re
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional, Set
from urllib.parse import urlparse

import aiohttp
from tqdm import tqdm

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent  # enrichment/src/lens -> project root
BASE_CSV = PROJECT_ROOT / "data" / "base.csv"

# ── Concurrency ───────────────────────────────────────────────────────────────
MAX_CONNECTIONS = 100     # global simultaneous HTTP connections
BATCH_SIZE = 50           # rows processed in parallel
CANDIDATES_PER_ROW = 12   # max links to HTTP-check per row
TOP_LINKS = 3             # links to keep in best_product_links
REQUEST_TIMEOUT = 8       # seconds per request (HTTP)
PLAYWRIGHT_TIMEOUT = 15   # seconds per page load (Playwright)

# ── Domain scoring ───────────────────────────────────────────────────────────
TIER1_DOMAINS = {
    # Italist's own platform — highest priority
    "italist.com",
    # User-specified preferred retailers
    "residenza725.com",
    "sugar.it",
    "daniello.com",
    "gebnegozionline.com",
    "wiseboutique.com",
    "oluxury.com",
    "thedoublef.com",
    "tizianafausti.com",
    "angelominetti.it",
    "vitkac.com",
    "farfetch.com",
    "savannahs.com",
    # Promoted from Tier 2 based on review data (top pick frequency)
    "beyondstyle.us",
    "thebs.com",
}

TIER2_DOMAINS = {
    "grailed.com",
    "net-a-porter.com",
    "mytheresa.com",
    "shopstyle.com",
    "shopstyle.com.au",
    "vestiairecollective.com",
    "editorialist.com",
    "ounass.com",
    "ssense.com",
    "matchesfashion.com",
    "yoox.com",
    "theoutnet.com",
    "luisaviaroma.com",
    "cettire.com",
    # Added based on review data
    "trenbe.com",
    "clothbase.com",
    "zalando.com",
    "zalando.co.uk",
    "zalando.ie",
    "modesens.com",
}

BLOCKLIST_DOMAINS = {
    "istockphoto.com",
    "shutterstock.com",
    "gettyimages.com",
    "playbuzz.com",
    "wixsite.com",
    "pinterest.com",
    "pinterest.it",
    "instagram.com",
    "facebook.com",
    "wikipedia.org",
    "reddit.com",
    "serpapi.com",
    "encrypted-tbn0.gstatic.com",
    "mikecassidyphotography.com",
    "blogspot.com",
    "tumblr.com",
    "flickr.com",
    "alamy.com",
    "dreamstime.com",
    "depositphotos.com",
    "stocksy.com",
    "unsplash.com",
    "pexels.com",
    # Confirmed garbage from review
    "parsogutma.com",
    "baamboozle.com",
    "giaam.org",
}

# Block by registered domain name regardless of TLD.
# e.g. "gettyimages" blocks gettyimages.com, gettyimages.ca, gettyimages.ae, etc.
BLOCKLIST_DOMAIN_NAMES = {
    "gettyimages",
    "playbuzz",
    "pinterest",
    "istockphoto",
    "shutterstock",
}

# Domains that heavily rely on JS rendering — use Playwright for content check
JS_HEAVY_DOMAINS = {
    "grailed.com",
    "vestiairecollective.com",
    "farfetch.com",
    "net-a-porter.com",
    "mytheresa.com",
    "ssense.com",
    "matchesfashion.com",
    "yoox.com",
    "theoutnet.com",
    "luisaviaroma.com",
    "cettire.com",
}

PRODUCT_PATH_PATTERNS = re.compile(
    r"/(product|prod|p|item|listing|listings|shop|buy|detail|details|catalog|catalogo)/",
    re.IGNORECASE,
)

# Filenames and path endings that indicate a category/listing page, not a product page.
CATEGORY_PAGE_FILENAMES = re.compile(
    r"/(list|listing|search|category|categories|catalog|collection|collections|index)"
    r"(\.html?|\.php|\.asp|\.aspx)?(\?|$)",
    re.IGNORECASE,
)

# Query params that only appear on category/search/paginated pages.
CATEGORY_QUERY_PARAMS = re.compile(
    r"[?&](cate_no|cat_no|category_id|category=|collection=|sort_by=|sort=|filter=|page=\d|mrk=)",
    re.IGNORECASE,
)

# Path patterns that indicate a brand/category browse page (no specific product)
CATEGORY_PATH_RE = re.compile(
    r"/(trousers|jeans|shirts|jackets|coats|shoes|sneakers|bags|hats|polo|t-shirts|dresses|tops|bottoms|accessories)"
    r"/?$",
    re.IGNORECASE,
)

# Generic listing endpoints: /products/, /product/, /shop/, /store/ at the END of the path
# (without a product slug/ID after them) — these are category overviews, not product pages.
# e.g. /wakeboard-gear/products/ is a listing; /products/3073069/ is a product page.
CATEGORY_GENERIC_LISTING_RE = re.compile(
    r"/(products|product|shop|store|items|catalogue|catalog|collections|collection)/?$",
    re.IGNORECASE,
)


def is_category_page(url: str) -> bool:
    """Return True if the URL looks like a category/listing page rather than a product page."""
    try:
        parsed = urlparse(url)
        path = parsed.path
        query = parsed.query
    except Exception:
        return False
    if CATEGORY_PAGE_FILENAMES.search(path):
        return True
    if CATEGORY_QUERY_PARAMS.search("?" + query):
        return True
    if CATEGORY_PATH_RE.search(path):
        return True
    if CATEGORY_GENERIC_LISTING_RE.search(path):
        return True
    return False

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

NO_VALID_LINKS = "no valid links"

# ── Unavailability patterns ───────────────────────────────────────────────────
# Matched case-insensitively against page body / rendered text.
# A match means the listing is dead — discard the link.
UNAVAILABLE_PATTERNS = re.compile(
    r"("
    r"listing (is |has been )?(removed|deleted|expired|ended)"
    r"|this item (has|have) (been |)(removed|deleted|expired)"
    r"|item (not found|is unavailable|no longer exists)"
    r"|page not found"
    r"|404[^0-9]"
    r"|this listing (is|has been) (no longer |)(active|available|removed)"
    r"|sorry[,\s]+this listing"
    r"|product (is |)(not|no longer) available"
    r"|removed from (sale|marketplace)"
    r"|listing (not found|unavailable)"
    r"|we couldn'?t find (this|that) (page|item|listing|product)"
    r"|the page you('re| are) looking for (doesn'?t|does not) exist"
    r")",
    re.IGNORECASE,
)

# Per-domain overrides: patterns specific to a site
DOMAIN_UNAVAILABLE_PATTERNS: dict = {
    "grailed.com": re.compile(
        r"(sorry[,\s]+this listing|listing (is|has been) (removed|no longer available)|"
        r"this listing is no longer available)",
        re.IGNORECASE,
    ),
    "vestiairecollective.com": re.compile(
        r"(this item (has been |)(removed|is no longer available)|item not available)",
        re.IGNORECASE,
    ),
    "farfetch.com": re.compile(
        r"(sorry, (this |)item (is |)(no longer |)available|product not found)",
        re.IGNORECASE,
    ),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    tqdm.write(msg)


def get_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return ""


def is_js_heavy(url: str) -> bool:
    domain = get_domain(url)
    return domain in JS_HEAVY_DOMAINS or any(
        domain.endswith("." + d) for d in JS_HEAVY_DOMAINS
    )


def find_unavailability_match(text: str, url: str) -> Optional[str]:
    """Return the matched snippet if the page signals the listing is gone, else None."""
    domain = get_domain(url)
    # Check domain-specific pattern first (more precise)
    domain_pattern = DOMAIN_UNAVAILABLE_PATTERNS.get(domain)
    if domain_pattern:
        m = domain_pattern.search(text)
        if m:
            return m.group(0)
    m = UNAVAILABLE_PATTERNS.search(text)
    return m.group(0) if m else None


def path_segments(url: str) -> List[str]:
    """Return non-empty path segments for a URL."""
    try:
        return [s for s in urlparse(url).path.split("/") if s]
    except Exception:
        return []


def ghost_redirect_reason(original_url: str, final_url: str) -> Optional[str]:
    """
    Return a reason string if this looks like a ghost redirect, else None.
    A ghost redirect is when a product URL lands on a much shallower page
    (e.g. /products instead of /products/specific-item-slug).
    """
    orig_parts = path_segments(original_url)
    final_parts = path_segments(final_url)
    if len(orig_parts) < 2:
        return None
    if len(final_parts) <= 1:
        return f"landed on root/shallow page ({len(orig_parts)} → {len(final_parts)} path segments)"
    if len(final_parts) <= len(orig_parts) // 2:
        return f"path collapsed ({len(orig_parts)} → {len(final_parts)} segments): {final_url}"
    return None




def score_candidate(item: dict, from_brand_match: bool, position: int = 0) -> int:
    score = 0
    url = item.get("link", "")
    domain = get_domain(url)

    # Brand match base bonus
    if from_brand_match:
        score += 3

    # Domain tier
    if domain in TIER1_DOMAINS or any(domain.endswith("." + d) for d in TIER1_DOMAINS):
        score += 5
    elif domain in TIER2_DOMAINS or any(domain.endswith("." + d) for d in TIER2_DOMAINS):
        score += 3

    # SerpAPI position bonus — respects Google Lens's own relevance ranking.
    # Position 0 = +5, position 1 = +4, ..., position 4 = +1, position 5+ = 0
    position_bonus = max(0, 5 - position)
    score += position_bonus

    # Product-like URL path
    if PRODUCT_PATH_PATTERNS.search(url):
        score += 2

    # Has price data
    if item.get("price"):
        score += 1

    return score


def is_tier1(url: str) -> bool:
    domain = get_domain(url)
    return domain in TIER1_DOMAINS or any(domain.endswith("." + d) for d in TIER1_DOMAINS)


def is_blocked_domain(url: str) -> bool:
    domain = get_domain(url)
    if domain in BLOCKLIST_DOMAINS:
        return True
    if any(domain.endswith("." + d) for d in BLOCKLIST_DOMAINS):
        return True
    # Block by registered domain name regardless of TLD
    # e.g. "gettyimages.ca" → split on "." → labels contain "gettyimages"
    labels = domain.split(".")
    if labels and labels[0] in BLOCKLIST_DOMAIN_NAMES:
        return True
    return False


def parse_matches(raw: str) -> List[dict]:
    if not raw or not raw.strip():
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, dict) and "error" in parsed:
        return []
    if isinstance(parsed, list):
        return parsed
    return []


_FARFETCH_ITEM_RE = re.compile(r"farfetch\.com/[a-z]{2}/shopping/.+/item-(\d+)", re.IGNORECASE)


def locale_dedup_key(url: str) -> Optional[str]:
    """
    Return a dedup key for sites that publish the same product at many locale URLs.
    If two URLs produce the same key, only the first is kept.
    Returns None for URLs that don't need locale dedup (use the full URL as key).
    """
    m = _FARFETCH_ITEM_RE.search(url)
    if m:
        return f"farfetch:item-{m.group(1)}"
    return None


def build_candidates(row: dict) -> List[dict]:
    brand_matches = parse_matches(row.get("lens_brand_matches", ""))
    all_matches = parse_matches(row.get("lens_all_matches", ""))

    seen_links: set = set()
    seen_item_keys: set = set()
    candidates: List[dict] = []

    def add(items: List[dict], from_brand: bool) -> None:
        position = 0
        for item in items:
            url = item.get("link", "")
            if not url or url in seen_links:
                continue
            if is_blocked_domain(url):
                log(f"  BLOCK {url}  → blocklisted domain ({get_domain(url)})")
                continue
            if is_category_page(url):
                log(f"  BLOCK {url}  → category/listing page (not a product page)")
                continue
            dedup_key = locale_dedup_key(url)
            if dedup_key and dedup_key in seen_item_keys:
                log(f"  SKIP  {url}  → locale duplicate ({dedup_key})")
                continue
            seen_links.add(url)
            if dedup_key:
                seen_item_keys.add(dedup_key)
            candidates.append(
                {
                    "link": url,
                    "title": item.get("title", ""),
                    "source": item.get("source", ""),
                    "price": item.get("price"),
                    "score": score_candidate(item, from_brand, position),
                    "from_brand_match": from_brand,
                }
            )
            position += 1

    add(brand_matches, True)
    add(all_matches, False)
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


# ── Stage 1 + 2: HTTP check + content scan ───────────────────────────────────

async def fetch_and_check(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    candidate: dict,
) -> Optional[dict]:
    """
    Stage 1: HEAD to confirm reachability.
    Stage 2: GET body + content scan for unavailability signals.
    Returns candidate (with 'status' key) if the link is alive, else None.
    """
    url = candidate["link"]
    source = candidate.get("source", "")

    async with semaphore:
        # ── Stage 1: HEAD ─────────────────────────────────────────────────────
        head_ok = False
        try:
            log(f"  HEAD  {url}  [{source}]")
            async with session.head(
                url,
                headers=HEADERS,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
                allow_redirects=True,
                ssl=False,
            ) as resp:
                status = resp.status
                final_url = str(resp.url)
                if status == 405:
                    log(f"  HEAD  {url}  → 405, retrying with GET")
                elif status in (200, 201, 202, 301, 302, 303, 307, 308):
                    ghost = ghost_redirect_reason(url, final_url)
                    if ghost:
                        log(f"  HEAD  {url}  → ghost redirect: {ghost} ✗")
                        return None
                    if final_url != url and is_category_page(final_url):
                        log(f"  HEAD  {url}  → redirected to category page: {final_url} ✗")
                        return None
                    log(f"  HEAD  {url}  → {status} ✓")
                    head_ok = True
                elif status == 403 and is_tier1(url):
                    # Tier 1 domains (farfetch, italist, etc.) block bots with 403
                    # but the link is real — trust it and skip content scan
                    log(f"  HEAD  {url}  → 403 but Tier 1 domain, trusting ✓")
                    return {**candidate, "status": 403, "content_checked": False}
                else:
                    log(f"  HEAD  {url}  → {status} ✗")
                    return None
        except asyncio.TimeoutError:
            log(f"  HEAD  {url}  → TIMEOUT ✗")
            return None
        except Exception as e:
            log(f"  HEAD  {url}  → ERROR ({e}), trying GET")

        # ── Stage 2: GET body + content scan ─────────────────────────────────
        # Always do a GET for content scan (even if HEAD passed),
        # unless this is a JS-heavy domain (handled by Playwright in stage 3).
        if is_js_heavy(url):
            # Skip content scan here; Playwright will handle it.
            log(f"  SKIP  content scan for JS-heavy domain: {get_domain(url)}")
            return {**candidate, "status": 200, "content_checked": False}

        try:
            log(f"  GET   {url}  [{source}] (content scan)")
            async with session.get(
                url,
                headers=HEADERS,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
                allow_redirects=True,
                ssl=False,
            ) as resp:
                status = resp.status
                final_url = str(resp.url)

                if status not in (200, 201, 202):
                    log(f"  GET   {url}  → {status} ✗")
                    return None

                ghost = ghost_redirect_reason(url, final_url)
                if ghost:
                    log(f"  GET   {url}  → ghost redirect: {ghost} ✗")
                    return None
                if final_url != url and is_category_page(final_url):
                    log(f"  GET   {url}  → redirected to category page: {final_url} ✗")
                    return None

                # Read up to 100 KB — enough for any unavailability message
                raw = await resp.content.read(100_000)
                try:
                    body = raw.decode("utf-8", errors="ignore")
                except Exception:
                    body = ""

                unavail = find_unavailability_match(body, url)
                if unavail:
                    log(f"  GET   {url}  → 200 but UNAVAILABLE: \"{unavail}\" ✗")
                    return None

                log(f"  GET   {url}  → {status} content OK ✓")
                return {**candidate, "status": status, "content_checked": True}

        except asyncio.TimeoutError:
            log(f"  GET   {url}  → TIMEOUT ✗")
            return None
        except Exception as e:
            log(f"  GET   {url}  → ERROR: {e} ✗")
            # If HEAD passed but GET failed, still accept it (HEAD was good)
            if head_ok:
                log(f"  GET   {url}  → accepting on HEAD result")
                return {**candidate, "status": 200, "content_checked": False}
            return None


# ── Stage 3: Playwright deep check ───────────────────────────────────────────

# Common cookie consent button selectors (ordered by specificity)
COOKIE_ACCEPT_SELECTORS = [
    "button[id*='accept']",
    "button[class*='accept']",
    "button[data-testid*='accept']",
    "[aria-label*='Accept']",
    "button:has-text('Accept all')",
    "button:has-text('Accept All')",
    "button:has-text('Accept cookies')",
    "button:has-text('Accept Cookies')",
    "button:has-text('I Accept')",
    "button:has-text('Agree')",
    "button:has-text('OK')",
    "button:has-text('Got it')",
    "button:has-text('Continue')",
    "[data-cookiebanner='accept_button']",
    "#onetrust-accept-btn-handler",
    ".cookie-accept",
    ".js-cookie-accept",
]


async def playwright_check(url: str) -> Optional[str]:
    """
    Renders the page with a headless Chromium browser, dismisses cookie banners,
    waits for JS content to load, then returns the visible page text.
    Called only for JS-heavy domains.
    """
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout  # type: ignore
    except ImportError:
        log("  [Playwright not installed — JS-heavy link will be rejected. Run: pip install playwright && playwright install chromium]")
        return None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                locale="en-US",
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            page = await context.new_page()
            log(f"  BROWSER  {url}")
            try:
                await page.goto(
                    url,
                    timeout=PLAYWRIGHT_TIMEOUT * 1000,
                    wait_until="domcontentloaded",
                )

                # Try to dismiss cookie consent banners
                for selector in COOKIE_ACCEPT_SELECTORS:
                    try:
                        btn = page.locator(selector).first
                        if await btn.is_visible(timeout=1000):
                            await btn.click()
                            log(f"  BROWSER  {url}  → dismissed cookie banner ({selector})")
                            break
                    except Exception:
                        continue

                # Wait for JS to render the listing status
                await page.wait_for_timeout(3000)

                text = await page.inner_text("body")
                log(f"  BROWSER  {url}  → page loaded ({len(text)} chars), checking content")
                return text

            except PWTimeout:
                log(f"  BROWSER  {url}  → page load TIMEOUT ✗")
                return None
            except Exception as e:
                log(f"  BROWSER  {url}  → load error: {e} ✗")
                return None
            finally:
                await browser.close()
    except Exception as e:
        log(f"  BROWSER  {url}  → Playwright error: {e} ✗")
        return None


async def deep_check_js_link(candidate: dict) -> Optional[dict]:
    """Run Playwright content check for a JS-heavy domain link."""
    url = candidate["link"]
    text = await playwright_check(url)
    if text is None:
        # Can't render JS — reject rather than blindly accept unverified JS-heavy links
        log(f"  BROWSER  {url}  → could not render JS page, rejecting to avoid stale listings ✗")
        return None

    unavail = find_unavailability_match(text, url)
    if unavail:
        log(f"  BROWSER  {url}  → UNAVAILABLE: \"{unavail}\" ✗")
        return None

    log(f"  BROWSER  {url}  → content OK ✓")
    return {**candidate, "content_checked": True}


# ── Combined per-row validation ───────────────────────────────────────────────

async def validate_row_candidates(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    candidates: List[dict],
) -> List[dict]:
    top = candidates[:CANDIDATES_PER_ROW]
    if len(candidates) > CANDIDATES_PER_ROW:
        dropped = candidates[CANDIDATES_PER_ROW:]
        log(f"  Checking top {len(top)} of {len(candidates)} candidates (dropped: {', '.join(c['link'] for c in dropped)})")
    else:
        log(f"  Checking {len(top)} candidate(s)")

    # Stage 1 + 2 for all candidates concurrently
    stage12_results = await asyncio.gather(
        *[fetch_and_check(session, semaphore, c) for c in top]
    )

    passed: List[dict] = []
    js_pending: List[dict] = []

    for result in stage12_results:
        if result is None:
            continue
        if not result.get("content_checked") and is_js_heavy(result["link"]):
            js_pending.append(result)
        else:
            passed.append(result)

    # Stage 3: Playwright for JS-heavy links (sequential to avoid browser spam)
    for candidate in js_pending:
        checked = await deep_check_js_link(candidate)
        if checked is not None:
            passed.append(checked)

    passed.sort(key=lambda c: c["score"], reverse=True)
    return passed[:TOP_LINKS]


# ── Main async loop ───────────────────────────────────────────────────────────

async def process_rows(
    pending_rows: List[dict],
    pbar: tqdm,
) -> tuple[List[dict], int]:
    """Validate links for pending rows. Returns (processed_rows, rows_with_links)."""
    semaphore = asyncio.Semaphore(MAX_CONNECTIONS)
    connector = aiohttp.TCPConnector(limit=MAX_CONNECTIONS, ssl=False)
    rows_with_links = 0
    processed: List[dict] = []

    async with aiohttp.ClientSession(connector=connector) as session:
        for batch_start in range(0, len(pending_rows), BATCH_SIZE):
            batch = pending_rows[batch_start : batch_start + BATCH_SIZE]

            batch_candidates = []
            for row in batch:
                candidates = build_candidates(row)
                sku = row.get("sku", "?")
                brand = row.get("brand", "")
                name = row.get("name", "")
                tqdm.write(
                    f"\n── SKU {sku} | {brand} | {name} "
                    f"({len(candidates)} candidate(s))"
                )
                batch_candidates.append(candidates)

            batch_tasks = [
                validate_row_candidates(session, semaphore, candidates)
                for candidates in batch_candidates
            ]
            batch_results = await asyncio.gather(*batch_tasks)

            for row, valid_links in zip(batch, batch_results):
                out_row = dict(row)
                sku = row.get("sku", "?")
                if valid_links:
                    out_row["best_product_links"] = json.dumps([
                        {
                            "link": c["link"],
                            "title": c["title"],
                            "source": c["source"],
                            "price": c["price"],
                            "score": c["score"],
                            "from_brand_match": c["from_brand_match"],
                            "content_checked": c.get("content_checked", False),
                        }
                        for c in valid_links
                    ])
                    rows_with_links += 1
                    best = valid_links[0]
                    tqdm.write(
                        f"  → BEST: [{best['score']}pts] {best['link']}"
                    )
                else:
                    out_row["best_product_links"] = NO_VALID_LINKS
                    tqdm.write(f"  → no valid links for SKU {sku}")

                processed.append(out_row)

            pbar.update(len(batch))
            await asyncio.sleep(random.uniform(0.1, 0.3))

    return processed, rows_with_links


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    csv.field_size_limit(10_000_000)

    csv_path = BASE_CSV
    print(f"Reading {csv_path}...")
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        all_rows = list(reader)

    print(f"Loaded {len(all_rows)} rows.")

    # Ensure best_product_links is in the fieldnames
    if "best_product_links" not in fieldnames:
        fieldnames.append("best_product_links")

    # Split rows into already-done and pending
    done_rows: List[dict] = []
    pending_rows: List[dict] = []
    for row in all_rows:
        existing = row.get("best_product_links", "").strip()
        if existing:
            done_rows.append(row)
        else:
            pending_rows.append(row)

    if done_rows:
        print(f"Resuming: {len(done_rows)} rows already have best_product_links, skipping them.")
    print(f"Rows to process: {len(pending_rows)}")

    if not pending_rows:
        print("Nothing to do — all rows already processed.")
        return

    # Process pending rows
    with tqdm(total=len(pending_rows), desc="Validating links", unit="row") as pbar:
        processed, rows_with_links = asyncio.run(
            process_rows(pending_rows, pbar)
        )

    # Write all rows back to base.csv atomically (temp file + rename)
    all_output = done_rows + processed
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=csv_path.parent, suffix=".csv", prefix=".base_tmp_"
    )
    try:
        with os.fdopen(tmp_fd, "w", newline="", encoding="utf-8") as out_file:
            writer = csv.DictWriter(out_file, fieldnames=fieldnames)
            writer.writeheader()
            for row in all_output:
                writer.writerow(row)
        shutil.move(tmp_path, csv_path)
    except Exception:
        os.unlink(tmp_path)
        raise

    print(f"\nDone. {rows_with_links}/{len(pending_rows)} new rows got valid links.")
    print(f"Total rows in output: {len(all_output)}")
    print(f"Updated: {csv_path}")


if __name__ == "__main__":
    main()

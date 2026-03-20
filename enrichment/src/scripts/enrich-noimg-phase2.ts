import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import {
  extractImageFromPage,
  verifyUrl,
  validateImagesWithVision,
  type ImageFlag,
} from "../adapters/noimg-claude-adapter.js";
import { translateColor } from "../images/search-config.js";
import { parseProductCSV } from "../parsers/csv-reader.js";
import { writeProductCSV } from "../parsers/csv-writer.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../");
const envPath = resolve(scriptDir, "../../.env");

try {
  loadEnvFile(envPath);
} catch {
  // .env file may not exist in CI
}
const dataDir = resolve(repoRoot, "data");
const frontendDataDir = resolve(repoRoot, "frontend/public/data");
const baseCsvPath = resolve(frontendDataDir, "base-missing-images.csv");
const checkpointPath = resolve(
  dataDir,
  "checkpoints/checkpoint-noimg-claude.json",
);
const phase2CheckpointPath = resolve(
  dataDir,
  "checkpoints/checkpoint-noimg-phase2.json",
);
const outputPath = resolve(dataDir, "enriched-noimg-claude.csv");
const frontendOutputPath = resolve(
  frontendDataDir,
  "enriched-noimg-claude.csv",
);

const CONCURRENCY = Number(process.env.CONCURRENCY) ?? 10;
if (isNaN(CONCURRENCY)) {
  console.error("CONCURRENCY must be a number");
  process.exit(1);
}

interface CheckpointArtifact {
  readonly row: Record<string, unknown>;
  readonly result: {
    readonly fields: Record<string, unknown>;
    readonly status: string;
  };
}

interface Phase1Checkpoint {
  readonly artifacts: Record<string, CheckpointArtifact>;
}

interface Phase2Progress {
  readonly completed: Record<string, string[] | undefined>;
  readonly imageFlags?: Record<string, ImageFlag[] | undefined>;
}

function parseSkuArg(args: readonly string[]): string[] | undefined {
  const skuIndex = args.indexOf("--sku");
  if (skuIndex === -1) return undefined;

  const value = args[skuIndex + 1];
  if (!value) {
    console.error("--sku requires a comma-separated list of SKUs");
    return undefined;
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLimitArg(args: readonly string[]): number | undefined {
  const limitIndex = args.indexOf("--limit");
  if (limitIndex === -1) return undefined;

  const value = Number(args[limitIndex + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    console.error("--limit must be a positive integer");
    return undefined;
  }
  return value;
}

function parseSkipValidation(args: readonly string[]): boolean {
  return args.includes("--skip-validation");
}

function parseValidateOnly(args: readonly string[]): boolean {
  return args.includes("--validate-only");
}

function loadPhase2Progress(): Phase2Progress {
  if (!existsSync(phase2CheckpointPath)) {
    return { completed: {} };
  }
  try {
    const raw = readFileSync(phase2CheckpointPath, "utf-8");
    return JSON.parse(raw) as Phase2Progress;
  } catch {
    return { completed: {} };
  }
}

function savePhase2Progress(progress: Phase2Progress): void {
  writeFileSync(
    phase2CheckpointPath,
    JSON.stringify(progress, null, 2),
    "utf-8",
  );
}

function getProductColor(row: Record<string, unknown>): string {
  const colorOriginal =
    typeof row.color_original === "string" ? row.color_original : "";
  const color = typeof row.color === "string" ? row.color : "";
  return translateColor(colorOriginal || color);
}

function detectVariantConfidence(
  imageUrls: readonly string[],
  color: string,
): "verified" | "variant_uncertain" | "unverified" {
  if (imageUrls.length === 0) return "unverified";

  // Check for sequential _00N variant patterns (e.g. _001, _002 — Shopify/Kering colorway variants)
  // _F/_R/_D/_E (Kering shot angles), _1/_2/_3 (Giglio views), _0/_1/_5 (SFCC views) are NOT variants
  const variantPattern = /_0[0-9]{2}[._]/;
  const hasVariantUrls = imageUrls.filter((u) => variantPattern.test(u));
  const uniqueVariantSuffixes = new Set(
    hasVariantUrls.flatMap((u) => {
      const matches = u.match(/_0([0-9]{2})[._]/g) ?? [];
      return matches;
    }),
  );

  // Only flag as variant_uncertain if we see at least 2 distinct _00N suffixes
  // (i.e. _001 AND _002 exist, suggesting multiple colorways)
  const hasMultipleVariants = uniqueVariantSuffixes.size >= 2;

  if (hasMultipleVariants && !color) return "variant_uncertain";
  if (color) return "verified";
  return "unverified";
}

async function main(): Promise<void> {
  if (!existsSync(checkpointPath)) {
    console.error(`Phase 1 checkpoint not found: ${checkpointPath}`);
    process.exit(1);
  }

  const cliArgs = process.argv.slice(2);
  const limit = parseLimitArg(cliArgs);
  const skuFilter = parseSkuArg(cliArgs);
  const skipValidation = parseSkipValidation(cliArgs);
  const validateOnly = parseValidateOnly(cliArgs);

  // Load Phase 1 checkpoint
  const phase1: Phase1Checkpoint = JSON.parse(
    readFileSync(checkpointPath, "utf-8"),
  );

  // Load base CSV for original product order
  const { products: allProducts } = parseProductCSV(baseCsvPath);

  // Build rows from checkpoint, preserving original order
  const rows: Record<string, Record<string, unknown>> = {};
  for (const product of allProducts) {
    const artifact = phase1.artifacts[product.sku];
    if (artifact) {
      rows[product.sku] = { ...artifact.row };
    }
  }

  // Find products with source_url that need image extraction
  let targetSkus = allProducts
    .map((p) => p.sku)
    .filter((sku) => {
      const row = rows[sku];
      return (
        row?.source_url &&
        typeof row.source_url === "string" &&
        row.source_url.trim() !== ""
      );
    });

  if (skuFilter) {
    targetSkus = targetSkus.filter((sku) => skuFilter.includes(sku));
    console.log(`Filtering to ${targetSkus.length} products by SKU`);
  } else if (limit) {
    targetSkus = targetSkus.slice(0, limit);
    console.log(`Limiting to ${targetSkus.length} products`);
  }

  // Load Phase 2 progress for resumability
  const progress = loadPhase2Progress();
  const alreadyDone = new Set(Object.keys(progress.completed));
  const remaining = targetSkus.filter((sku) => !alreadyDone.has(sku));

  // Apply already-completed results to rows
  for (const [sku, imageUrls] of Object.entries(progress.completed)) {
    const row = rows[sku];
    if (row && imageUrls && imageUrls.length > 0) {
      row.image_links = imageUrls.join("|");
    }
  }

  // Restore previously computed image flags
  if (progress.imageFlags) {
    for (const [sku, flags] of Object.entries(progress.imageFlags)) {
      const row = rows[sku];
      if (row && flags && flags.length > 0) {
        row.image_flags = flags;
      }
    }
  }

  // --validate-only: run vision validation on already-completed products, then merge into existing CSV
  if (validateOnly) {
    // Back up existing CSV before modifying
    if (existsSync(outputPath)) {
      const backupPath = outputPath.replace(
        ".csv",
        `-backup-${Date.now()}.csv`,
      );
      copyFileSync(outputPath, backupPath);
      console.log(`[validate-only] Backed up existing CSV → ${backupPath}`);
    }

    const existingFlags = progress.imageFlags ?? {};
    const skusWithImages = Object.entries(progress.completed)
      .filter(([, urls]) => urls && urls.length > 0)
      .map(([sku]) => sku)
      .filter((sku) => !skuFilter || skuFilter.includes(sku));

    // Only validate products that don't already have flags
    const needsValidation = skusWithImages.filter((sku) => !existingFlags[sku]);

    console.log(
      `[validate-only] ${skusWithImages.length} products with images`,
    );
    console.log(
      `[validate-only] ${skusWithImages.length - needsValidation.length} already validated, ${needsValidation.length} remaining`,
    );

    if (needsValidation.length === 0) {
      console.log(`[validate-only] Nothing to validate`);
    } else {
      const concurrencyLimit = pLimit(CONCURRENCY);
      let validated = 0;
      let totalFlagged = 0;
      const updatedFlags: Record<string, ImageFlag[] | undefined> = {
        ...existingFlags,
      };

      await Promise.all(
        needsValidation.map((sku) =>
          concurrencyLimit(async () => {
            const row = rows[sku];
            const imageUrls = progress.completed[sku] ?? [];
            const color = getProductColor(row);

            const productInfo = {
              brand: typeof row.brand === "string" ? row.brand : "",
              name: typeof row.name === "string" ? row.name : "",
              code: typeof row.code === "string" ? row.code : "",
              color,
              category: typeof row.category === "string" ? row.category : "",
            };

            const validation = await validateImagesWithVision(
              productInfo,
              imageUrls,
            );

            if (validation.flaggedUrls.length > 0) {
              updatedFlags[sku] = validation.flaggedUrls;
              row.image_flags = validation.flaggedUrls;
              totalFlagged += validation.flaggedUrls.length;
              console.log(
                `[validate-only] ${sku}: flagged ${validation.flaggedUrls.length}/${imageUrls.length} images`,
              );
              for (const flag of validation.flaggedUrls) {
                console.log(`  ⚠ ${flag.url}: ${flag.reason}`);
              }
            }

            validated++;
            console.log(
              `[validate-only] ${validated}/${needsValidation.length} ${sku} — ${validation.flaggedUrls.length > 0 ? `${validation.flaggedUrls.length} flagged` : "all valid"}`,
            );

            // Save progress after each product
            savePhase2Progress({
              completed: { ...progress.completed },
              imageFlags: { ...updatedFlags },
            });
          }),
        ),
      );

      console.log(
        `\n[validate-only] Done: ${totalFlagged} images flagged across ${needsValidation.length} products`,
      );
    }

    // Recompute image_confidence for all products with images (so it's not lost)
    for (const sku of skusWithImages) {
      const row = rows[sku];
      const imageUrls = progress.completed[sku] ?? [];
      const color = getProductColor(row);
      row.image_confidence = detectVariantConfidence(imageUrls, color);
    }

    // Rewrite CSV with flags + image_confidence applied
    const orderedRows = allProducts
      .map((p) => rows[p.sku])
      .filter((row): row is Record<string, unknown> => row !== undefined);

    writeProductCSV(orderedRows, outputPath);
    console.log(`[validate-only] CSV updated: ${outputPath}`);
    console.log(`[validate-only] Copy to frontend manually: cp ${outputPath} ${frontendOutputPath}`);
    return;
  }

  console.log(`[phase2] ${targetSkus.length} products with source_url`);
  console.log(
    `[phase2] ${alreadyDone.size} already done, ${remaining.length} remaining`,
  );
  if (skipValidation) {
    console.log(
      `[phase2] --skip-validation: skipping vision-based junk image detection`,
    );
  }

  const concurrencyLimit = pLimit(CONCURRENCY);
  let processedCount = alreadyDone.size;
  let imagesFound = Object.values(progress.completed).filter(
    (v) => v && v.length > 0,
  ).length;

  const updatedProgress: Phase2Progress = {
    completed: { ...progress.completed },
    imageFlags: { ...(progress.imageFlags ?? {}) },
  };

  await Promise.all(
    remaining.map((sku) =>
      concurrencyLimit(async () => {
        const row = rows[sku];
        const sourceUrl = row?.source_url as string;
        const color = getProductColor(row);

        const rawImageUrls = await extractImageFromPage(
          sourceUrl,
          color || undefined,
        );

        // Verify each image URL is accessible
        const imageUrls = rawImageUrls
          ? (
              await Promise.all(
                rawImageUrls.map(async (imgUrl) => {
                  const ok = await verifyUrl(imgUrl);
                  if (!ok)
                    console.log(
                      `[phase2] ${sku}: dropping dead image URL: ${imgUrl}`,
                    );
                  return ok ? imgUrl : null;
                }),
              )
            ).filter((u): u is string => u !== null)
          : [];

        // Vision-based junk image validation
        let flaggedImages: ImageFlag[] = [];
        if (!skipValidation && imageUrls.length > 0) {
          const productInfo = {
            brand: typeof row.brand === "string" ? row.brand : "",
            name: typeof row.name === "string" ? row.name : "",
            code: typeof row.code === "string" ? row.code : "",
            color,
            category: typeof row.category === "string" ? row.category : "",
          };

          const validation = await validateImagesWithVision(
            productInfo,
            imageUrls,
          );
          flaggedImages = validation.flaggedUrls;

          if (flaggedImages.length > 0) {
            console.log(
              `[phase2] ${sku}: flagged ${flaggedImages.length}/${imageUrls.length} images as junk`,
            );
            for (const flag of flaggedImages) {
              console.log(`  ⚠ ${flag.url}: ${flag.reason}`);
            }
          }
        }

        // Store ALL verified URLs in image_links (including flagged ones)
        if (imageUrls.length > 0) {
          row.image_links = imageUrls.join("|");
          imagesFound++;
        }

        if (flaggedImages.length > 0) {
          row.image_flags = flaggedImages;
        }

        const imageConfidence = detectVariantConfidence(imageUrls, color);
        row.image_confidence = imageConfidence;

        const verifiedUrls = imageUrls.length > 0 ? imageUrls : undefined;
        Object.assign(updatedProgress.completed, { [sku]: verifiedUrls });
        if (flaggedImages.length > 0) {
          Object.assign(updatedProgress.imageFlags!, { [sku]: flaggedImages });
        }
        savePhase2Progress({
          completed: { ...updatedProgress.completed },
          imageFlags: { ...updatedProgress.imageFlags },
        });

        processedCount++;
        const flagNote =
          flaggedImages.length > 0 ? ` (${flaggedImages.length} flagged)` : "";
        const status =
          imageUrls.length > 0
            ? `${imageUrls.length} images${flagNote}`
            : "no image";
        console.log(
          `[phase2] ${processedCount}/${targetSkus.length} ${sku} → ${status}${color ? ` (color: ${color})` : ""}`,
        );
      }),
    ),
  );

  // Write full CSV (all 500 rows in original order)
  const orderedRows = allProducts
    .map((p) => rows[p.sku])
    .filter((row): row is Record<string, unknown> => row !== undefined);

  writeProductCSV(orderedRows, outputPath);
  copyFileSync(outputPath, frontendOutputPath);

  const totalImages = Object.values(updatedProgress.completed)
    .filter((v) => v && v.length > 0)
    .reduce((sum, v) => sum + (v?.length ?? 0), 0);

  console.log(
    `\n[phase2] Complete: ${imagesFound} products with images (${totalImages} total URLs) out of ${targetSkus.length} products with URLs`,
  );
  console.log(`Output: ${outputPath}`);
  console.log(`Frontend copy: ${frontendOutputPath}`);
}

main().catch((error) => {
  console.error("Phase 2 image extraction failed:", error);
  process.exit(1);
});

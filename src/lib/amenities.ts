import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { cached, HOUR } from "./cache";
import { nearest, withinRadius, type LatLng } from "./geo";
import { CATEGORY_LABELS } from "./types";
import type { Amenity, AmenityCategory, NearbyAmenity } from "./types";

export { CATEGORY_LABELS };

export const AMENITY_DIR = path.join(process.cwd(), "data", "amenities");

export type AmenityFile = {
  category: AmenityCategory;
  /** Human-readable provenance, shown in the UI so numbers are attributable. */
  source: string;
  sourceUrl?: string;
  fetchedAt: string;
  points: Amenity[];
};

/**
 * Read one seeded dataset. Returns null when the category has not been seeded
 * yet — callers surface that as "not set up" rather than "nothing nearby",
 * because those two mean very different things to someone choosing a flat.
 */
export async function loadCategory(
  category: AmenityCategory,
): Promise<AmenityFile | null> {
  const file = path.join(AMENITY_DIR, `${category}.json`);

  // Key the cache on the file's mtime so re-running `npm run seed` takes effect
  // immediately instead of waiting out a TTL, while a warm file still costs
  // only one stat per request.
  let stamp: string;
  try {
    stamp = String((await stat(file)).mtimeMs);
  } catch {
    return null;
  }

  return cached(`amenity:${category}:${stamp}`, HOUR, async () => {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as AmenityFile;
      return Array.isArray(parsed.points) ? parsed : null;
    } catch {
      return null;
    }
  });
}

export async function seededCategories(): Promise<AmenityCategory[]> {
  // Short TTL: this drives the setup banner, which must notice a seed run.
  return cached("amenity:index", 30_000, async () => {
    try {
      const files = await readdir(AMENITY_DIR);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, "") as AmenityCategory)
        .filter((c) => c in CATEGORY_LABELS);
    } catch {
      return [];
    }
  });
}

export type CategoryResult =
  | { status: "ok"; source: string; sourceUrl?: string; fetchedAt: string; items: NearbyAmenity[] }
  | { status: "not-seeded"; reason: string };

const NOT_SEEDED = (category: AmenityCategory): CategoryResult => ({
  status: "not-seeded",
  reason: `${CATEGORY_LABELS[category]} has not been downloaded yet — run \`npm run seed\`.`,
});

/** Everything of one category within `radiusM` of a point, nearest first. */
export async function nearbyByCategory(
  origin: LatLng,
  category: AmenityCategory,
  radiusM: number,
  limit = 25,
): Promise<CategoryResult> {
  const file = await loadCategory(category);
  if (!file) return NOT_SEEDED(category);
  return {
    status: "ok",
    source: file.source,
    sourceUrl: file.sourceUrl,
    fetchedAt: file.fetchedAt,
    items: withinRadius(origin, file.points, radiusM).slice(0, limit),
  };
}

/** The `n` closest of one category regardless of distance. */
export async function nearestByCategory(
  origin: LatLng,
  category: AmenityCategory,
  count = 3,
): Promise<CategoryResult> {
  const file = await loadCategory(category);
  if (!file) return NOT_SEEDED(category);
  return {
    status: "ok",
    source: file.source,
    sourceUrl: file.sourceUrl,
    fetchedAt: file.fetchedAt,
    items: nearest(origin, file.points, count),
  };
}

export function isOk(
  r: CategoryResult,
): r is Extract<CategoryResult, { status: "ok" }> {
  return r.status === "ok";
}

export function itemsOf(r: CategoryResult): NearbyAmenity[] {
  return isOk(r) ? r.items : [];
}

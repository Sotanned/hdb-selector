import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cached, DAY, HOUR } from "./cache";
import { datastoreSearch, RESOURCES, type CkanRecord } from "./datagov";
import { haversine, type LatLng } from "./geo";
import { parseTransaction, priceStats } from "./resale";
import type { PriceStats } from "./types";

export const TOWNS_FILE = path.join(process.cwd(), "data", "towns.json");

export type TownCentroid = LatLng & { name: string };

type TownsFile = {
  source: string;
  fetchedAt: string;
  towns: TownCentroid[];
};

/**
 * Town centre points, geocoded by the seed script. Used to attribute a map grid
 * cell to an HDB town by nearest centre — an approximation of the real town
 * boundaries, which is why the map labels the financial layer as town-level.
 */
export async function loadTowns(): Promise<TownsFile | null> {
  let stamp: string;
  try {
    stamp = String((await stat(TOWNS_FILE)).mtimeMs);
  } catch {
    return null;
  }
  return cached(`towns:${stamp}`, HOUR, async () => {
    try {
      const parsed = JSON.parse(await readFile(TOWNS_FILE, "utf8")) as TownsFile;
      return Array.isArray(parsed.towns) && parsed.towns.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  });
}

export function nearestTown(
  point: LatLng,
  towns: readonly TownCentroid[],
): TownCentroid | null {
  let best: TownCentroid | null = null;
  let bestD = Infinity;
  for (const t of towns) {
    const d = haversine(point, t);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

export type TownPrices = {
  flatType: string;
  /** Median resale price per town, for towns that had recent sales. */
  byTown: Record<string, PriceStats>;
  /** Median across every town's transactions, used as the comparison baseline. */
  islandMedian: number | null;
  townsCovered: number;
};

/**
 * Recent median price per town for one flat type.
 *
 * One request per town rather than one huge scan: the datastore only does
 * exact-match filters, and the most recent 500 sales in a town is far more than
 * enough for a median while staying inside a single page.
 */
export async function fetchTownPrices(
  towns: readonly string[],
  flatType: string,
): Promise<TownPrices> {
  return cached(`townPrices:${flatType}`, DAY, async () => {
    const byTown: Record<string, PriceStats> = {};
    const allPrices: number[] = [];

    // Batched so we never have more than a handful of connections open to
    // data.gov.sg at once.
    const BATCH = 6;
    for (let i = 0; i < towns.length; i += BATCH) {
      const batch = towns.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (town) => {
          try {
            const { records } = await datastoreSearch<CkanRecord>(
              {
                resourceId: RESOURCES.resale2017,
                filters: { town, flat_type: flatType },
                limit: 500,
                sort: "month desc",
              },
              DAY,
            );
            const txns = records
              .map(parseTransaction)
              .filter((t): t is NonNullable<typeof t> => t !== null);
            const stats = priceStats(txns);
            if (stats && stats.count >= 5) {
              byTown[town] = stats;
              for (const t of txns) allPrices.push(t.price);
            }
          } catch {
            // A town that fails just has no price layer; the rest still render.
          }
        }),
      );
    }

    allPrices.sort((a, b) => a - b);
    const islandMedian =
      allPrices.length > 0 ? allPrices[Math.floor(allPrices.length / 2)] : null;

    return {
      flatType,
      byTown,
      islandMedian,
      townsCovered: Object.keys(byTown).length,
    };
  });
}

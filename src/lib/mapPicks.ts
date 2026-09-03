import { cached, HOUR } from "./cache";
import type { MapPick } from "./mapTypes";
import { searchAddress } from "./onemap";
import { fetchResale } from "./resale";
import type { ResaleTransaction } from "./types";

/** Most recent sale per block+street, most recent month first, cheapest first within a month. */
function dedupeByBlock(txns: readonly ResaleTransaction[]): ResaleTransaction[] {
  const byBlock = new Map<string, ResaleTransaction>();
  for (const t of txns) {
    const key = `${t.block}|${t.streetName}`;
    const existing = byBlock.get(key);
    if (!existing || t.month > existing.month) byBlock.set(key, t);
  }
  return [...byBlock.values()].sort(
    (a, b) => b.month.localeCompare(a.month) || a.price - b.price,
  );
}

/**
 * A handful of concrete, recently-sold blocks in a town — the closest thing to
 * "listings" the resale dataset can offer, and what turns "this town scores 82"
 * into somewhere you could actually go look.
 *
 * Geocoding happens one candidate at a time (cheap and cached — OneMap search
 * needs no token) and stops once `limit` blocks have resolved to a location,
 * since a report page needs coordinates to compute anything.
 */
export async function fetchTownPicks(
  town: string,
  flatType: string,
  limit = 5,
): Promise<MapPick[]> {
  return cached(`mapPicks:${town}:${flatType}:${limit}`, HOUR, async () => {
    let { transactions } = await fetchResale({ town, flatType, monthsBack: 6 });
    if (transactions.length === 0) {
      ({ transactions } = await fetchResale({ town, flatType, monthsBack: 24 }));
    }

    const candidates = dedupeByBlock(transactions).slice(0, limit * 4);
    const picks: MapPick[] = [];

    for (const t of candidates) {
      if (picks.length >= limit) break;
      const hits = await searchAddress(`${t.block} ${t.streetName}`, 1).catch(() => []);
      const hit = hits[0];
      if (!hit) continue;
      picks.push({
        address: hit.address,
        block: t.block,
        street: t.streetName,
        lat: hit.lat,
        lng: hit.lng,
        price: t.price,
        month: t.month,
        flatType: t.flatType,
        floorAreaSqm: t.floorAreaSqm,
        storeyRange: t.storeyRange,
      });
    }

    return picks;
  });
}

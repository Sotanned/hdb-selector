import { stat } from "node:fs/promises";
import path from "node:path";
import { loadCategory, AMENITY_DIR } from "./amenities";
import { cached, HOUR } from "./cache";
import { fetchAllPsi, nearestPsiRegion } from "./environment";
import { CBD, haversine, type LatLng } from "./geo";
import {
  scoreAccessibility,
  scoreDailyLiving,
  scoreEducation,
  scoreEnvironment,
  scoreFinancial,
  scoreRecreation,
} from "./scoring";
import { SpatialIndex } from "./spatial";
import { fetchTownPrices, loadTowns, nearestTown } from "./towns";
import { NO_DATA, PILLAR_ORDER, type GridCellTuple, type MapGrid } from "./mapTypes";
import type { Amenity, AmenityCategory } from "./types";

export { PILLAR_ORDER };
export type { GridCellTuple, MapGrid };

/** Bounding box covering Singapore's mainland and the near offshore islands. */
const BOUNDS = { minLat: 1.21, maxLat: 1.475, minLng: 103.61, maxLng: 104.09 };

/**
 * Grid resolution in metres. 400 m is about the distance you would walk without
 * thinking about it, so a cell is roughly "one neighbourhood", and the whole
 * island fits in a payload the browser can re-weight instantly.
 */
const CELL_M = 400;

/**
 * A cell is kept only if it looks inhabited. Bus stops are the best available
 * proxy — they blanket every residential area and nothing else — so this doubles
 * as a coastline mask without needing a coastline dataset.
 */
const HABITATION_RADIUS_M = 700;

const enc = (n: number | null) => (n == null ? NO_DATA : Math.round(n));

async function amenityStamp(): Promise<string> {
  const parts: string[] = [];
  for (const name of ["busStop", "mrt", "school", "preschool", "hawker", "supermarket", "clinic", "mall", "park", "sports", "dengue"]) {
    try {
      parts.push(String((await stat(path.join(AMENITY_DIR, `${name}.json`))).mtimeMs));
    } catch {
      parts.push("0");
    }
  }
  return parts.join("-");
}

async function indexFor(
  category: AmenityCategory,
  cellSizeM = 1_000,
): Promise<SpatialIndex<Amenity> | null> {
  const file = await loadCategory(category);
  if (!file || file.points.length === 0) return null;
  return new SpatialIndex(file.points, cellSizeM);
}

/**
 * Score every inhabited 400 m cell in Singapore on the same six pillars the
 * single-property report uses.
 *
 * Reuses the scoring functions rather than reimplementing them, so the map and
 * the report can never drift apart — if a threshold changes, both move.
 */
export async function buildMapGrid(flatType: string): Promise<MapGrid> {
  const stamp = await amenityStamp();
  return cached(`mapGrid:${flatType}:${stamp}`, HOUR * 6, () => compute(flatType));
}

async function compute(flatType: string): Promise<MapGrid> {
  const notes: string[] = [];

  const [busIdx, mrtIdx, schoolFile, preschoolIdx, hawkerIdx, superIdx, clinicIdx, mallIdx, parkIdx, sportsIdx, dengueIdx] =
    await Promise.all([
      indexFor("busStop"),
      indexFor("mrt", 2_000),
      loadCategory("school"),
      indexFor("preschool"),
      indexFor("hawker", 2_000),
      indexFor("supermarket"),
      indexFor("clinic"),
      indexFor("mall", 2_000),
      indexFor("park", 2_000),
      indexFor("sports", 2_000),
      indexFor("dengue"),
    ]);

  // Primary and secondary schools are scored separately, so they get their own
  // indexes rather than one combined one.
  const isPrimary = (a: Amenity) => (a.meta?.level ?? a.kind ?? "").toUpperCase().includes("PRIMARY");
  const isSecondary = (a: Amenity) => (a.meta?.level ?? a.kind ?? "").toUpperCase().includes("SECONDARY");
  const primaryIdx = schoolFile ? new SpatialIndex(schoolFile.points.filter(isPrimary), 2_000) : null;
  const secondaryIdx = schoolFile ? new SpatialIndex(schoolFile.points.filter(isSecondary), 2_000) : null;

  const present: AmenityCategory[] = [];
  const missing: AmenityCategory[] = [];
  const track = (c: AmenityCategory, idx: unknown) => (idx ? present.push(c) : missing.push(c));
  track("busStop", busIdx);
  track("mrt", mrtIdx);
  track("school", schoolFile);
  track("preschool", preschoolIdx);
  track("hawker", hawkerIdx);
  track("supermarket", superIdx);
  track("clinic", clinicIdx);
  track("mall", mallIdx);
  track("park", parkIdx);
  track("sports", sportsIdx);
  track("dengue", dengueIdx);

  // The habitation mask needs at least one dense, island-wide dataset. Bus stops
  // are ideal; preschools are a workable stand-in; without either there is
  // nothing to draw a map from.
  const maskIdx = busIdx ?? preschoolIdx ?? superIdx;
  const maskRadius = busIdx ? HABITATION_RADIUS_M : 1_200;
  if (!busIdx && maskIdx) {
    notes.push(
      "Bus stops are not seeded, so inhabited areas were inferred from a sparser dataset — the map's coverage will be patchier than reality.",
    );
  }

  const townsFile = await loadTowns();
  const townNames = townsFile?.towns.map((t) => t.name) ?? [];
  const townPrices =
    townsFile && townNames.length > 0
      ? await fetchTownPrices(townNames, flatType).catch(() => null)
      : null;

  if (!townsFile) {
    notes.push("Town centres are not seeded, so the financial layer is unavailable.");
  } else if (!townPrices || townPrices.townsCovered === 0) {
    notes.push("Resale prices could not be loaded, so the financial layer is unavailable.");
  }

  // PSI is reported per region, so it is fetched once for all five and looked
  // up per cell rather than re-requested.
  let psiByRegion: Record<string, number | null> = {};
  try {
    psiByRegion = await fetchAllPsi();
  } catch {
    notes.push("Live PSI is unavailable, so air quality is left out of the environment score.");
  }

  const cells: GridCellTuple[] = [];
  const townIndex = new Map<string, number>(townNames.map((n, i) => [n, i]));

  // Convert the metre spacing into degree steps once.
  const latStep = (CELL_M / 111_320);
  const lngStep = latStep / Math.cos((1.35 * Math.PI) / 180);

  for (let lat = BOUNDS.minLat; lat <= BOUNDS.maxLat; lat += latStep) {
    for (let lng = BOUNDS.minLng; lng <= BOUNDS.maxLng; lng += lngStep) {
      const point: LatLng = { lat, lng };

      if (maskIdx && maskIdx.countWithin(point, maskRadius) === 0) continue;

      const town = townsFile ? nearestTown(point, townsFile.towns) : null;
      const townStats = town && townPrices ? townPrices.byTown[town.name] : undefined;

      const financial = scoreFinancial({
        blockMedian: townStats?.median ?? null,
        townMedian: townPrices?.islandMedian ?? null,
        // No block, so no lease — the curve simply omits it.
        remainingLeaseYears: null,
        townYoy: null,
      });

      const nearestMrt = mrtIdx?.nearest(point) ?? null;
      const accessibility = scoreAccessibility({
        nearestMrtWalkMin: nearestMrt?.walkMin ?? null,
        nearestMrtName: nearestMrt?.name ?? null,
        busStopsWithin400m: busIdx ? busIdx.countWithin(point, 400) : null,
        cbdDistanceKm: haversine(point, CBD) / 1000,
      });

      const education = scoreEducation({
        primaryWithin1km: primaryIdx ? primaryIdx.countWithin(point, 1_000) : null,
        primaryWithin2km: primaryIdx ? primaryIdx.countWithin(point, 2_000) : null,
        secondaryWithin2km: secondaryIdx ? secondaryIdx.countWithin(point, 2_000) : null,
        preschoolsWithin500m: preschoolIdx ? preschoolIdx.countWithin(point, 500) : null,
      });

      const dailyLiving = scoreDailyLiving({
        hawkerWithin800m: hawkerIdx ? hawkerIdx.countWithin(point, 800) : null,
        supermarketWithin800m: superIdx ? superIdx.countWithin(point, 800) : null,
        clinicWithin1km: clinicIdx ? clinicIdx.countWithin(point, 1_000) : null,
        mallWithin1km: mallIdx ? mallIdx.countWithin(point, 1_000) : null,
      });

      const recreation = scoreRecreation({
        sportsWithin1km: sportsIdx ? sportsIdx.countWithin(point, 1_000) : null,
        parksWithin1km: parkIdx ? parkIdx.countWithin(point, 1_000) : null,
        nearestSportsName: null,
        nearestSportsWalkMin: null,
      });

      const environment = scoreEnvironment({
        psi24h: psiByRegion[nearestPsiRegion(point)] ?? null,
        psiRegion: null,
        dengueClustersWithin500m: dengueIdx ? dengueIdx.countWithin(point, 500) : null,
        forecast: null,
      });

      cells.push([
        Number(lat.toFixed(4)),
        Number(lng.toFixed(4)),
        town ? (townIndex.get(town.name) ?? NO_DATA) : NO_DATA,
        enc(financial.score),
        enc(accessibility.score),
        enc(education.score),
        enc(dailyLiving.score),
        enc(recreation.score),
        enc(environment.score),
      ]);
    }
  }

  if (cells.length === 0) {
    notes.push(
      "No amenity datasets are seeded, so there is nothing to map yet — run `npm run seed`.",
    );
  }

  return {
    cellSizeM: CELL_M,
    flatType,
    towns: townNames,
    cells,
    townMedians: townNames.map((n) => townPrices?.byTown[n]?.median ?? null),
    islandMedian: townPrices?.islandMedian ?? null,
    seeded: present,
    missing,
    townsAvailable: Boolean(townsFile),
    generatedAt: new Date().toISOString(),
    notes,
  };
}

import { CBD, haversine, type LatLng } from "./geo";
import { itemsOf, nearbyByCategory, nearestByCategory, type CategoryResult } from "./amenities";
import { fetchAirQuality, fetchForecast, fetchRainfall } from "./environment";
import { fetchBlockInfo, resolveTown, type BlockInfo } from "./hdb";
import {
  fetchResale,
  monthlyMedians,
  priceStats,
  remainingLeaseYears,
  toHdbStreetName,
  yoyChange,
} from "./resale";
import {
  scoreAccessibility,
  scoreDailyLiving,
  scoreEducation,
  scoreEnvironment,
  scoreFinancial,
  scoreRecreation,
} from "./scoring";
import type {
  MonthlyPoint,
  NearbyAmenity,
  PillarScore,
  PriceStats,
  ResaleTransaction,
} from "./types";

export type ReportRequest = {
  lat: number;
  lng: number;
  address: string;
  block: string | null;
  street: string | null;
  postal: string | null;
  /** Optional flat type filter, e.g. "4 ROOM". */
  flatType?: string;
};

export type SourceStatus = { source: string; ok: boolean; detail?: string };

export type PropertyReport = {
  request: ReportRequest;
  town: string | null;
  blockInfo: BlockInfo | null;
  remainingLeaseYears: number | null;

  prices: {
    flatType: string | null;
    block: PriceStats | null;
    town: PriceStats | null;
    trend: MonthlyPoint[];
    townYoy: number | null;
    recentTransactions: ResaleTransaction[];
    /** Flat types that actually transacted at this block, most recent first. */
    availableFlatTypes: string[];
  };

  nearby: Record<string, NearbyAmenity[]>;
  amenityStatus: Record<string, CategoryResult["status"]>;

  environment: {
    psi24h: number | null;
    psiRegion: string | null;
    forecast: string | null;
    rainfallMm: number | null;
    rainfallStation: string | null;
    updatedAt: string | null;
  };

  cbdDistanceKm: number;
  pillars: PillarScore[];
  sources: SourceStatus[];
  generatedAt: string;
};

const settled = async <T>(
  source: string,
  statuses: SourceStatus[],
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> => {
  try {
    const value = await fn();
    statuses.push({ source, ok: true });
    return value;
  } catch (err) {
    statuses.push({
      source,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
};

function countIn(items: NearbyAmenity[], maxM: number): number {
  return items.filter((i) => i.distanceM <= maxM).length;
}

function isPrimary(a: NearbyAmenity): boolean {
  const level = (a.meta?.level ?? a.kind ?? "").toUpperCase();
  return level.includes("PRIMARY");
}

function isSecondary(a: NearbyAmenity): boolean {
  const level = (a.meta?.level ?? a.kind ?? "").toUpperCase();
  return level.includes("SECONDARY");
}

/**
 * Build the full report for one address.
 *
 * Every upstream call is isolated: a dataset that is down or not yet seeded
 * degrades its own card and its own pillar score, and never fails the report.
 */
export async function buildReport(req: ReportRequest): Promise<PropertyReport> {
  const point: LatLng = { lat: req.lat, lng: req.lng };
  const sources: SourceStatus[] = [];
  const hdbStreet = req.street ? toHdbStreetName(req.street) : null;

  const town =
    req.block && hdbStreet
      ? await settled("HDB town lookup", sources, () => resolveTown(req.block!, hdbStreet), null)
      : null;

  const [blockInfo, blockResale, townResale] = await Promise.all([
    req.block && hdbStreet
      ? settled("HDB property information", sources, () => fetchBlockInfo(req.block!, hdbStreet), null)
      : Promise.resolve(null),
    req.block && hdbStreet
      ? settled(
          "HDB resale prices (block)",
          sources,
          () => fetchResale({ block: req.block!, streetName: hdbStreet, monthsBack: 36 }),
          { transactions: [], truncated: false },
        )
      : Promise.resolve({ transactions: [], truncated: false }),
    town
      ? settled(
          "HDB resale prices (town)",
          sources,
          () => fetchResale({ town, flatType: req.flatType, monthsBack: 24 }),
          { transactions: [], truncated: false },
        )
      : Promise.resolve({ transactions: [], truncated: false }),
  ]);

  // Pick the flat type to report on: the caller's choice, else the most common
  // type transacted at this block, so the headline number means something.
  const typeCounts = new Map<string, number>();
  for (const t of blockResale.transactions) {
    typeCounts.set(t.flatType, (typeCounts.get(t.flatType) ?? 0) + 1);
  }
  const availableFlatTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);
  const flatType = req.flatType ?? availableFlatTypes[0] ?? null;

  const blockTxns = flatType
    ? blockResale.transactions.filter((t) => t.flatType === flatType)
    : blockResale.transactions;
  const townTxns = flatType
    ? townResale.transactions.filter((t) => t.flatType === flatType)
    : townResale.transactions;

  const leaseYears =
    blockInfo?.yearCompleted != null
      ? remainingLeaseYears(blockInfo.yearCompleted)
      : (remainingLeaseYears(blockTxns[0]?.leaseCommenceYear ?? 0) ?? null);

  /* ------------------------------ Amenities ----------------------------- */

  const [mrt, bus, schools, preschools, hawker, supermarket, clinic, mall, park, sports, dengue] =
    await Promise.all([
      nearestByCategory(point, "mrt", 3),
      nearbyByCategory(point, "busStop", 500, 40),
      nearbyByCategory(point, "school", 2_000, 40),
      nearbyByCategory(point, "preschool", 800, 40),
      nearbyByCategory(point, "hawker", 1_200, 20),
      nearbyByCategory(point, "supermarket", 1_200, 30),
      nearbyByCategory(point, "clinic", 1_500, 40),
      nearbyByCategory(point, "mall", 1_500, 20),
      nearbyByCategory(point, "park", 1_500, 20),
      nearbyByCategory(point, "sports", 1_500, 20),
      nearbyByCategory(point, "dengue", 1_000, 20),
    ]);

  const catResults = {
    mrt, busStop: bus, school: schools, preschool: preschools, hawker,
    supermarket, clinic, mall, park, sports, dengue,
  } as const;

  const nearby: Record<string, NearbyAmenity[]> = {};
  const amenityStatus: Record<string, CategoryResult["status"]> = {};
  for (const [key, result] of Object.entries(catResults)) {
    nearby[key] = itemsOf(result);
    amenityStatus[key] = result.status;
  }

  const seededSchools = schools.status === "ok";
  const primaries = nearby.school.filter(isPrimary);
  const secondaries = nearby.school.filter(isSecondary);

  /* ----------------------------- Environment ---------------------------- */

  const [air, forecast, rainfall] = await Promise.all([
    settled("NEA PSI", sources, () => fetchAirQuality(point), null),
    settled("NEA 2-hour forecast", sources, () => fetchForecast(point), null),
    settled("NEA rainfall", sources, () => fetchRainfall(point), null),
  ]);

  const cbdDistanceKm = haversine(point, CBD) / 1000;

  /* ------------------------------- Scoring ------------------------------ */

  const blockStats = priceStats(blockTxns);
  const townStats = priceStats(townTxns);

  const pillars: PillarScore[] = [
    scoreFinancial({
      blockMedian: blockStats?.median ?? null,
      townMedian: townStats?.median ?? null,
      remainingLeaseYears: leaseYears,
      townYoy: yoyChange(townTxns),
    }),
    scoreAccessibility({
      nearestMrtWalkMin: nearby.mrt[0]?.walkMin ?? null,
      nearestMrtName: nearby.mrt[0]?.name ?? null,
      busStopsWithin400m: bus.status === "ok" ? countIn(nearby.busStop, 400) : null,
      cbdDistanceKm,
    }),
    scoreEducation({
      primaryWithin1km: seededSchools ? countIn(primaries, 1_000) : null,
      primaryWithin2km: seededSchools ? primaries.length : null,
      secondaryWithin2km: seededSchools ? secondaries.length : null,
      preschoolsWithin500m:
        preschools.status === "ok" ? countIn(nearby.preschool, 500) : null,
    }),
    scoreDailyLiving({
      hawkerWithin800m: hawker.status === "ok" ? countIn(nearby.hawker, 800) : null,
      supermarketWithin800m:
        supermarket.status === "ok" ? countIn(nearby.supermarket, 800) : null,
      clinicWithin1km: clinic.status === "ok" ? countIn(nearby.clinic, 1_000) : null,
      mallWithin1km: mall.status === "ok" ? countIn(nearby.mall, 1_000) : null,
    }),
    scoreRecreation({
      sportsWithin1km: sports.status === "ok" ? countIn(nearby.sports, 1_000) : null,
      parksWithin1km: park.status === "ok" ? countIn(nearby.park, 1_000) : null,
      nearestSportsName: nearby.sports[0]?.name ?? null,
      nearestSportsWalkMin: nearby.sports[0]?.walkMin ?? null,
    }),
    scoreEnvironment({
      psi24h: air?.psi24h ?? null,
      psiRegion: air?.region ?? null,
      dengueClustersWithin500m:
        dengue.status === "ok" ? countIn(nearby.dengue, 500) : null,
      forecast: forecast?.forecast ?? null,
    }),
  ];

  return {
    request: req,
    town,
    blockInfo,
    remainingLeaseYears: leaseYears,
    prices: {
      flatType,
      block: blockStats,
      town: townStats,
      trend: monthlyMedians(townTxns),
      townYoy: yoyChange(townTxns),
      recentTransactions: blockTxns.slice(0, 12),
      availableFlatTypes,
    },
    nearby,
    amenityStatus,
    environment: {
      psi24h: air?.psi24h ?? null,
      psiRegion: air?.region ?? null,
      forecast: forecast?.forecast ?? null,
      rainfallMm: rainfall?.rainfallMm ?? null,
      rainfallStation: rainfall?.nearestStationName ?? null,
      updatedAt: air?.updatedAt ?? forecast?.updatedAt ?? null,
    },
    cbdDistanceKm,
    pillars,
    sources,
    generatedAt: new Date().toISOString(),
  };
}

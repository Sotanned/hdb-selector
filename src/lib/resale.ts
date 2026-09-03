import { datastoreSearchAll, RESOURCES, type CkanRecord } from "./datagov";
import { DAY } from "./cache";
import type { MonthlyPoint, PriceStats, ResaleTransaction } from "./types";

const SQM_TO_SQF = 10.7639;

function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? NaN);
  return Number.isFinite(n) ? n : NaN;
}

function str(v: string | number | null | undefined): string {
  return v == null ? "" : String(v).trim();
}

export function parseTransaction(r: CkanRecord): ResaleTransaction | null {
  const price = num(r.resale_price);
  const area = num(r.floor_area_sqm);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    month: str(r.month),
    town: str(r.town),
    flatType: str(r.flat_type),
    block: str(r.block),
    streetName: str(r.street_name),
    storeyRange: str(r.storey_range),
    floorAreaSqm: Number.isFinite(area) ? area : 0,
    flatModel: str(r.flat_model),
    leaseCommenceYear: num(r.lease_commence_date) || 0,
    remainingLease: str(r.remaining_lease) || null,
    price,
  };
}

/** ISO-ish "YYYY-MM" string for `monthsBack` months before today. */
export function monthKey(monthsBack = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function priceStats(txns: readonly ResaleTransaction[]): PriceStats | null {
  if (txns.length === 0) return null;
  const prices = txns.map((t) => t.price).sort((a, b) => a - b);
  const psfs = txns
    .filter((t) => t.floorAreaSqm > 0)
    .map((t) => t.price / (t.floorAreaSqm * SQM_TO_SQF))
    .sort((a, b) => a - b);

  return {
    count: txns.length,
    median: Math.round(quantile(prices, 0.5)),
    p25: Math.round(quantile(prices, 0.25)),
    p75: Math.round(quantile(prices, 0.75)),
    min: prices[0],
    max: prices[prices.length - 1],
    medianPsf: psfs.length ? Math.round(quantile(psfs, 0.5)) : null,
  };
}

/** Median price per calendar month, oldest first. Months with no sales are skipped. */
export function monthlyMedians(txns: readonly ResaleTransaction[]): MonthlyPoint[] {
  const byMonth = new Map<string, number[]>();
  for (const t of txns) {
    if (!t.month) continue;
    const bucket = byMonth.get(t.month) ?? [];
    bucket.push(t.price);
    byMonth.set(t.month, bucket);
  }
  return [...byMonth.entries()]
    .map(([month, prices]) => {
      prices.sort((a, b) => a - b);
      return { month, median: Math.round(quantile(prices, 0.5)), count: prices.length };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Year-on-year change in median price, comparing the most recent 6 months
 * against the same 6 months a year earlier. Returns null when either window is
 * too thin to say anything honest about.
 */
export function yoyChange(
  txns: readonly ResaleTransaction[],
  minPerWindow = 4,
): number | null {
  const recentStart = monthKey(5);
  const priorStart = monthKey(17);
  const priorEnd = monthKey(12);

  const recent = txns.filter((t) => t.month >= recentStart);
  const prior = txns.filter((t) => t.month >= priorStart && t.month <= priorEnd);
  if (recent.length < minPerWindow || prior.length < minPerWindow) return null;

  const a = priceStats(prior)!.median;
  const b = priceStats(recent)!.median;
  if (!a) return null;
  return (b - a) / a;
}

/**
 * Remaining lease in years. HDB leases run 99 years from the lease commencement
 * date, so this is derived rather than trusted from the free-text field (which
 * is only present on newer records).
 */
export function remainingLeaseYears(leaseCommenceYear: number): number | null {
  if (!leaseCommenceYear || leaseCommenceYear < 1960) return null;
  const elapsed = new Date().getUTCFullYear() - leaseCommenceYear;
  return Math.max(0, 99 - elapsed);
}

export type ResaleQuery = {
  town?: string;
  flatType?: string;
  block?: string;
  streetName?: string;
  /** How far back to look, in months. */
  monthsBack?: number;
};

/**
 * Fetch resale transactions matching a query.
 *
 * The datastore only supports exact-match filters, so street/block filtering is
 * done upstream (cheap, exact) and the date window is applied locally.
 */
export async function fetchResale(
  query: ResaleQuery,
): Promise<{ transactions: ResaleTransaction[]; truncated: boolean }> {
  const filters: Record<string, string> = {};
  if (query.town) filters.town = query.town.toUpperCase();
  if (query.flatType) filters.flat_type = query.flatType.toUpperCase();
  if (query.block) filters.block = query.block.toUpperCase();
  if (query.streetName) filters.street_name = query.streetName.toUpperCase();

  const cutoff = monthKey(query.monthsBack ?? 24);

  const { records, truncated } = await datastoreSearchAll<CkanRecord>(
    { resourceId: RESOURCES.resale2017, filters, sort: "month desc" },
    Object.keys(filters).length ? 5_000 : 2_000,
    DAY,
  );

  const transactions = records
    .map(parseTransaction)
    .filter((t): t is ResaleTransaction => t !== null && t.month >= cutoff);

  return { transactions, truncated };
}

/**
 * OneMap street names are spelled out ("AVENUE", "STREET"); the HDB dataset
 * abbreviates them. Without this the block-level price lookup silently returns
 * nothing for most addresses.
 */
const STREET_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bAVENUE\b/g, "AVE"],
  [/\bSTREET\b/g, "ST"],
  [/\bROAD\b/g, "RD"],
  [/\bDRIVE\b/g, "DR"],
  [/\bCLOSE\b/g, "CL"],
  [/\bCRESCENT\b/g, "CRES"],
  [/\bPLACE\b/g, "PL"],
  [/\bTERRACE\b/g, "TER"],
  [/\bCENTRAL\b/g, "CTRL"],
  [/\bGARDENS\b/g, "GDNS"],
  [/\bHEIGHTS\b/g, "HTS"],
  [/\bLINK\b/g, "LINK"],
  [/\bNORTH\b/g, "NTH"],
  [/\bSOUTH\b/g, "STH"],
  [/\bUPPER\b/g, "UPP"],
  [/\bJALAN\b/g, "JLN"],
  [/\bLORONG\b/g, "LOR"],
  [/\bBUKIT\b/g, "BT"],
  [/\bTANJONG\b/g, "TG"],
  [/\bKAMPONG\b/g, "KG"],
  [/\bSAINT\b/g, "ST."],
  [/\bMARKET\b/g, "MKT"],
  [/\bPARK\b/g, "PARK"],
  [/\bCOMMONWEALTH\b/g, "C'WEALTH"],
];

export function toHdbStreetName(oneMapRoadName: string): string {
  let s = oneMapRoadName.toUpperCase().trim();
  for (const [pattern, replacement] of STREET_ABBREVIATIONS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s+/g, " ");
}

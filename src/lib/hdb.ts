import { datastoreSearch, RESOURCES, type CkanRecord } from "./datagov";
import { DAY } from "./cache";

/**
 * HDB building-contract town codes, used only as a last-resort fallback: the
 * resale dataset itself is the authoritative source for the town string, and
 * `resolveTown` prefers it.
 */
const TOWN_CODES: Record<string, string> = {
  AMK: "ANG MO KIO",
  BB: "BUKIT BATOK",
  BD: "BEDOK",
  BH: "BISHAN",
  BM: "BUKIT MERAH",
  BP: "BUKIT PANJANG",
  BT: "BUKIT TIMAH",
  CCK: "CHOA CHU KANG",
  CL: "CLEMENTI",
  CT: "CENTRAL AREA",
  GL: "GEYLANG",
  HG: "HOUGANG",
  JE: "JURONG EAST",
  JW: "JURONG WEST",
  KWN: "KALLANG/WHAMPOA",
  MP: "MARINE PARADE",
  PG: "PUNGGOL",
  PRC: "PASIR RIS",
  QT: "QUEENSTOWN",
  SB: "SEMBAWANG",
  SGN: "SERANGOON",
  SK: "SENGKANG",
  TAP: "TAMPINES",
  TG: "TENGAH",
  TP: "TOA PAYOH",
  WD: "WOODLANDS",
  YS: "YISHUN",
};

export type BlockInfo = {
  block: string;
  street: string;
  town: string | null;
  yearCompleted: number | null;
  maxFloorLevel: number | null;
  totalDwellingUnits: number | null;
  hasMarketOrHawker: boolean;
  hasMultiStoreyCarpark: boolean;
  hasPrecinctPavilion: boolean;
  hasCommercial: boolean;
};

const yes = (v: unknown) => String(v ?? "").trim().toUpperCase() === "Y";
const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

/**
 * Block-level facts from the HDB Property Information dataset: age of the
 * block, how tall it is, and whether the precinct has its own hawker centre or
 * multi-storey carpark.
 */
export async function fetchBlockInfo(
  block: string,
  street: string,
): Promise<BlockInfo | null> {
  const { records } = await datastoreSearch<CkanRecord>(
    {
      resourceId: RESOURCES.hdbPropertyInfo,
      filters: { blk_no: block.toUpperCase(), street: street.toUpperCase() },
      limit: 1,
    },
    DAY * 7,
  );
  const r = records[0];
  if (!r) return null;

  const code = String(r.bldg_contract_town ?? "").trim().toUpperCase();
  return {
    block: String(r.blk_no ?? block),
    street: String(r.street ?? street),
    town: TOWN_CODES[code] ?? null,
    yearCompleted: int(r.year_completed),
    maxFloorLevel: int(r.max_floor_lvl),
    totalDwellingUnits: int(r.total_dwelling_units),
    hasMarketOrHawker: yes(r.market_hawker),
    hasMultiStoreyCarpark: yes(r.multistorey_carpark),
    hasPrecinctPavilion: yes(r.precinct_pavilion),
    hasCommercial: yes(r.commercial),
  };
}

/**
 * Find the HDB town for an address. The resale dataset is authoritative because
 * its town strings are exactly the ones we filter on later; the property-info
 * town code is only consulted if the block has never transacted since 2017.
 */
export async function resolveTown(
  block: string,
  street: string,
): Promise<string | null> {
  const attempts: Array<Record<string, string>> = [
    { block: block.toUpperCase(), street_name: street.toUpperCase() },
    { street_name: street.toUpperCase() },
  ];

  for (const filters of attempts) {
    try {
      const { records } = await datastoreSearch<CkanRecord>(
        { resourceId: RESOURCES.resale2017, filters, limit: 1 },
        DAY * 7,
      );
      const town = String(records[0]?.town ?? "").trim();
      if (town) return town;
    } catch {
      // Fall through to the next strategy rather than failing the whole report.
    }
  }

  const info = await fetchBlockInfo(block, street).catch(() => null);
  return info?.town ?? null;
}

export const TOWN_LIST = [...new Set(Object.values(TOWN_CODES))].sort();

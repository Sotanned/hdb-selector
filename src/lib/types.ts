import type { LatLng } from "./geo";

export type PillarId =
  | "financial"
  | "accessibility"
  | "education"
  | "dailyLiving"
  | "recreation"
  | "environment";

export const PILLARS: ReadonlyArray<{
  id: PillarId;
  label: string;
  blurb: string;
}> = [
  {
    id: "financial",
    label: "Financial",
    blurb: "Price against the town median, lease left, and what it costs you monthly.",
  },
  {
    id: "accessibility",
    label: "Getting around",
    blurb: "Walk to the MRT, bus stops at your door, distance to town.",
  },
  {
    id: "education",
    label: "Schools",
    blurb: "Primary schools inside the 1 km and 2 km registration bands.",
  },
  {
    id: "dailyLiving",
    label: "Daily living",
    blurb: "Hawker centres, markets, supermarkets, clinics and malls nearby.",
  },
  {
    id: "recreation",
    label: "Sport & green space",
    blurb: "Sports halls, pools, gyms, parks and park connectors.",
  },
  {
    id: "environment",
    label: "Environment",
    blurb: "Air quality, rainfall and dengue clusters around the block.",
  },
] as const;

export type Weights = Record<PillarId, number>;

export const DEFAULT_WEIGHTS: Weights = {
  financial: 5,
  accessibility: 5,
  education: 3,
  dailyLiving: 4,
  recreation: 3,
  environment: 3,
};

/** A point of interest loaded from a seeded dataset. */
export type Amenity = LatLng & {
  id: string;
  name: string;
  /** Free-form subtype, e.g. "MRT", "LRT", "Primary", "Swimming Complex". */
  kind?: string;
  /** Extra dataset-specific fields worth surfacing, e.g. line codes. */
  meta?: Record<string, string>;
};

export type AmenityCategory =
  | "mrt"
  | "busStop"
  | "school"
  | "preschool"
  | "hawker"
  | "supermarket"
  | "clinic"
  | "mall"
  | "park"
  | "sports"
  | "dengue";

export type NearbyAmenity = Amenity & { distanceM: number; walkMin: number };

export const CATEGORY_LABELS: Record<AmenityCategory, string> = {
  mrt: "MRT / LRT stations",
  busStop: "Bus stops",
  school: "Schools",
  preschool: "Preschools & kindergartens",
  hawker: "Hawker centres",
  supermarket: "Supermarkets",
  clinic: "Clinics",
  mall: "Shopping malls",
  park: "Parks",
  sports: "Sports facilities",
  dengue: "Active dengue clusters",
};

export type ResaleTransaction = {
  month: string;
  town: string;
  flatType: string;
  block: string;
  streetName: string;
  storeyRange: string;
  floorAreaSqm: number;
  flatModel: string;
  leaseCommenceYear: number;
  remainingLease: string | null;
  price: number;
};

export type PriceStats = {
  count: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  medianPsf: number | null;
};

export type MonthlyPoint = { month: string; median: number; count: number };

export type PillarScore = {
  pillar: PillarId;
  /** 0–100, or null when the underlying data could not be loaded. */
  score: number | null;
  /** Short human-readable justification shown under the score. */
  summary: string;
  /** Individual signals that fed the score. */
  factors: Array<{ label: string; value: string; verdict: "good" | "ok" | "poor" | "unknown" }>;
  /** Present when the pillar could not be scored. */
  unavailable?: string;
};

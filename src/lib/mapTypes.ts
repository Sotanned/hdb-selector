import type { AmenityCategory, PillarId } from "./types";

/**
 * Wire contract for /api/map, shared by the server that builds the grid and the
 * browser that re-weights it. Kept free of Node imports so the client bundle
 * does not drag in the filesystem-backed dataset loaders.
 */

export const PILLAR_ORDER: PillarId[] = [
  "financial",
  "accessibility",
  "education",
  "dailyLiving",
  "recreation",
  "environment",
];

export const MAP_FLAT_TYPES = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"] as const;

/** Sentinel for "this pillar could not be scored here" — never a zero. */
export const NO_DATA = -1;

/**
 * One cell as `[lat, lng, townIndex, ...six pillar scores]`.
 *
 * Columnar tuples rather than objects: at a few thousand cells, repeated JSON
 * keys would roughly double the payload for no benefit.
 */
export type GridCellTuple = [
  number, number, number,
  number, number, number, number, number, number,
];

export type MapGrid = {
  cellSizeM: number;
  flatType: string;
  towns: string[];
  cells: GridCellTuple[];
  /** Median price per town for the chosen flat type, indexed like `towns`. */
  townMedians: Array<number | null>;
  islandMedian: number | null;
  /** Which amenity datasets were available when this grid was built. */
  seeded: AmenityCategory[];
  missing: AmenityCategory[];
  townsAvailable: boolean;
  generatedAt: string;
  notes: string[];
};

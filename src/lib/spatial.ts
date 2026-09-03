import { degreeBox, haversine, walkMinutes, type LatLng, type WithDistance } from "./geo";

/**
 * Uniform-grid spatial hash over a set of points.
 *
 * The map scores a few thousand grid cells against a dozen amenity datasets at
 * once, which is ~10^8 distance tests with the naive scan in `geo.ts`. Bucketing
 * points into ~1 km cells and visiting only the buckets a query circle touches
 * turns that into a few tens of comparisons per query.
 *
 * Build once per dataset and reuse — construction is the expensive part.
 */
export class SpatialIndex<T extends LatLng> {
  private readonly buckets = new Map<string, T[]>();
  private readonly cellDegLat: number;
  private readonly cellDegLng: number;

  constructor(
    readonly points: readonly T[],
    cellSizeM = 1_000,
    /** Latitude the longitude scaling is computed at; Singapore is ~1.35°N. */
    referenceLat = 1.35,
  ) {
    const box = degreeBox({ lat: referenceLat, lng: 103.8 }, cellSizeM);
    this.cellDegLat = box.maxLat - referenceLat;
    this.cellDegLng = box.maxLng - 103.8;

    for (const p of points) {
      const key = this.key(p.lat, p.lng);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(p);
      else this.buckets.set(key, [p]);
    }
  }

  private key(lat: number, lng: number): string {
    return `${Math.floor(lat / this.cellDegLat)}:${Math.floor(lng / this.cellDegLng)}`;
  }

  /** All points within `radiusM`, nearest first. */
  within(origin: LatLng, radiusM: number): WithDistance<T>[] {
    const out: WithDistance<T>[] = [];
    const box = degreeBox(origin, radiusM);
    const minRow = Math.floor(box.minLat / this.cellDegLat);
    const maxRow = Math.floor(box.maxLat / this.cellDegLat);
    const minCol = Math.floor(box.minLng / this.cellDegLng);
    const maxCol = Math.floor(box.maxLng / this.cellDegLng);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = this.buckets.get(`${row}:${col}`);
        if (!bucket) continue;
        for (const p of bucket) {
          const d = haversine(origin, p);
          if (d <= radiusM) {
            out.push({ ...p, distanceM: Math.round(d), walkMin: Math.round(walkMinutes(d)) });
          }
        }
      }
    }

    out.sort((a, b) => a.distanceM - b.distanceM);
    return out;
  }

  /**
   * How many points fall within `radiusM`. Avoids the allocation and sort that
   * `within` pays for — this is the call the grid scorer makes thousands of times.
   */
  countWithin(origin: LatLng, radiusM: number): number {
    const box = degreeBox(origin, radiusM);
    const minRow = Math.floor(box.minLat / this.cellDegLat);
    const maxRow = Math.floor(box.maxLat / this.cellDegLat);
    const minCol = Math.floor(box.minLng / this.cellDegLng);
    const maxCol = Math.floor(box.maxLng / this.cellDegLng);

    let count = 0;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = this.buckets.get(`${row}:${col}`);
        if (!bucket) continue;
        for (const p of bucket) {
          if (haversine(origin, p) <= radiusM) count++;
        }
      }
    }
    return count;
  }

  /**
   * Closest point, searching outward in rings so a sparse dataset (MRT stations)
   * does not force a scan of everything. Returns null only when the index is empty.
   */
  nearest(origin: LatLng, maxRadiusM = 8_000): WithDistance<T> | null {
    for (let radius = 500; radius <= maxRadiusM; radius *= 2) {
      const hits = this.within(origin, radius);
      if (hits.length > 0) return hits[0];
    }
    return null;
  }

  get size(): number {
    return this.points.length;
  }
}

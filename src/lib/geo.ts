export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Straight-line distance understates real walking distance. Singapore's HDB
 * estates are fairly permeable (sheltered walkways, park connectors), so a
 * detour factor of 1.3 is a reasonable planning assumption. It is an estimate,
 * not a routed distance — see `routeWalk` in lib/onemap.ts for the real thing.
 */
export const WALK_DETOUR_FACTOR = 1.3;

/** Average adult walking speed, metres per minute (~4.8 km/h). */
export const WALK_SPEED_M_PER_MIN = 80;

export function walkMinutes(straightLineMetres: number): number {
  return (straightLineMetres * WALK_DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN;
}

/**
 * Degrees of latitude/longitude that cover `metres` at the given latitude.
 * Used to pre-filter large point sets before the exact haversine pass.
 */
export function degreeBox(origin: LatLng, metres: number) {
  const dLat = (metres / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(toRad(origin.lat)), 1e-6);
  return {
    minLat: origin.lat - dLat,
    maxLat: origin.lat + dLat,
    minLng: origin.lng - dLng,
    maxLng: origin.lng + dLng,
  };
}

export type WithDistance<T> = T & { distanceM: number; walkMin: number };

export function withinRadius<T extends LatLng>(
  origin: LatLng,
  points: readonly T[],
  radiusM: number,
): WithDistance<T>[] {
  const box = degreeBox(origin, radiusM);
  const out: WithDistance<T>[] = [];
  for (const p of points) {
    if (
      p.lat < box.minLat ||
      p.lat > box.maxLat ||
      p.lng < box.minLng ||
      p.lng > box.maxLng
    ) {
      continue;
    }
    const d = haversine(origin, p);
    if (d <= radiusM) {
      out.push({ ...p, distanceM: Math.round(d), walkMin: Math.round(walkMinutes(d)) });
    }
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out;
}

export function nearest<T extends LatLng>(
  origin: LatLng,
  points: readonly T[],
  count = 1,
): WithDistance<T>[] {
  const scored = points.map((p) => {
    const d = haversine(origin, p);
    return { ...p, distanceM: Math.round(d), walkMin: Math.round(walkMinutes(d)) };
  });
  scored.sort((a, b) => a.distanceM - b.distanceM);
  return scored.slice(0, count);
}

/** Raffles Place, the conventional centre for "distance to town". */
export const CBD: LatLng = { lat: 1.2839, lng: 103.8515 };

export function isInSingapore(p: LatLng): boolean {
  return p.lat > 1.13 && p.lat < 1.48 && p.lng > 103.6 && p.lng < 104.1;
}

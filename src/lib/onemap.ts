import { cached, DAY, HOUR } from "./cache";
import { fetchJson, UpstreamError } from "./http";
import type { LatLng } from "./geo";

const BASE = "https://www.onemap.gov.sg/api";

export type AddressResult = {
  /** Normalised display address, e.g. "123 ANG MO KIO AVE 3 SINGAPORE 560123". */
  address: string;
  blockNo: string | null;
  streetName: string | null;
  building: string | null;
  postal: string | null;
  lat: number;
  lng: number;
};

type OneMapSearchResponse = {
  found: number;
  results: Array<{
    SEARCHVAL: string;
    BLK_NO: string;
    ROAD_NAME: string;
    BUILDING: string;
    ADDRESS: string;
    POSTAL: string;
    LATITUDE: string;
    LONGITUDE: string;
  }>;
};

const NIL = new Set(["NIL", "NULL", ""]);
const clean = (v: string | undefined) =>
  v && !NIL.has(v.trim().toUpperCase()) ? v.trim() : null;

/**
 * OneMap's address search. This endpoint is open — no token required — which is
 * why it is the entry point for the whole app.
 */
export async function searchAddress(
  term: string,
  limit = 10,
): Promise<AddressResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const url =
    `${BASE}/common/elastic/search?searchVal=${encodeURIComponent(q)}` +
    `&returnGeom=Y&getAddrDetails=Y&pageNum=1`;

  return cached(`onemap:search:${q.toLowerCase()}`, HOUR * 12, async () => {
    const body = await fetchJson<OneMapSearchResponse>(url, { source: "OneMap" });
    return (body.results ?? [])
      .map((r): AddressResult | null => {
        const lat = Number(r.LATITUDE);
        const lng = Number(r.LONGITUDE);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          address: clean(r.ADDRESS) ?? r.SEARCHVAL,
          blockNo: clean(r.BLK_NO),
          streetName: clean(r.ROAD_NAME),
          building: clean(r.BUILDING),
          postal: clean(r.POSTAL),
          lat,
          lng,
        };
      })
      .filter((r): r is AddressResult => r !== null)
      .slice(0, limit);
  });
}

/* ------------------------------------------------------------------ */
/* Token-gated endpoints. Optional: the app degrades to straight-line   */
/* estimates when no OneMap credentials are configured.                 */
/* ------------------------------------------------------------------ */

export function hasOneMapCredentials(): boolean {
  return Boolean(process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD);
}

async function getToken(): Promise<string> {
  if (!hasOneMapCredentials()) {
    throw new UpstreamError("OneMap", 401, "ONEMAP_EMAIL / ONEMAP_PASSWORD are not set");
  }
  // OneMap tokens last three days; refresh well inside that window.
  return cached("onemap:token", DAY, async () => {
    const res = await fetch(`${BASE}/auth/post/getToken`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: process.env.ONEMAP_EMAIL,
        password: process.env.ONEMAP_PASSWORD,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new UpstreamError("OneMap", res.status, `Token request failed (${res.status})`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new UpstreamError("OneMap", null, "Token response had no access_token");
    }
    return body.access_token;
  });
}

export type WalkRoute = {
  distanceM: number;
  durationMin: number;
};

/**
 * Real walking route between two points. Falls back to `null` (rather than
 * throwing) when credentials are missing, so callers can quietly use the
 * straight-line estimate instead.
 */
export async function routeWalk(from: LatLng, to: LatLng): Promise<WalkRoute | null> {
  if (!hasOneMapCredentials()) return null;

  const key = `onemap:walk:${from.lat.toFixed(5)},${from.lng.toFixed(5)}:${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
  try {
    return await cached(key, DAY, async () => {
      const token = await getToken();
      const url =
        `${BASE}/public/routingsvc/route?start=${from.lat},${from.lng}` +
        `&end=${to.lat},${to.lng}&routeType=walk`;
      const body = await fetchJson<{
        route_summary?: { total_distance?: number; total_time?: number };
      }>(url, { source: "OneMap routing", headers: { Authorization: token } });

      const distance = body.route_summary?.total_distance;
      const time = body.route_summary?.total_time;
      if (distance == null || time == null) {
        throw new UpstreamError("OneMap routing", null, "Route had no summary");
      }
      return { distanceM: Math.round(distance), durationMin: Math.round(time / 60) };
    });
  } catch {
    return null;
  }
}

export type ReverseGeocode = { address: string | null; postal: string | null };

export async function reverseGeocode(point: LatLng): Promise<ReverseGeocode | null> {
  if (!hasOneMapCredentials()) return null;
  try {
    return await cached(
      `onemap:rev:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
      HOUR,
      async () => {
        const token = await getToken();
        const url =
          `${BASE}/public/revgeocode?location=${point.lat},${point.lng}` +
          `&buffer=100&addressType=All`;
        const body = await fetchJson<{
          GeocodeInfo?: Array<{ BUILDINGNAME?: string; BLOCK?: string; ROAD?: string; POSTALCODE?: string }>;
        }>(url, { source: "OneMap revgeocode", headers: { Authorization: token } });
        const first = body.GeocodeInfo?.[0];
        if (!first) return { address: null, postal: null };
        const address = [first.BLOCK, first.ROAD].filter(Boolean).join(" ") || first.BUILDINGNAME || null;
        return { address, postal: clean(first.POSTALCODE) };
      },
    );
  } catch {
    return null;
  }
}

/** OneMap raster tiles are open for use and need no token. */
export const ONEMAP_TILE_URL =
  "https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png";

export const ONEMAP_ATTRIBUTION =
  'Map data © <a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">OneMap</a>, Singapore Land Authority';

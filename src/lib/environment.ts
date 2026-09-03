import { cached, MINUTE } from "./cache";
import { fetchJson } from "./http";
import { haversine, type LatLng } from "./geo";

/**
 * NEA real-time readings, served through data.gov.sg's v2 real-time API.
 * Every reading here is regional or station-level: it describes the area around
 * a flat, never the flat itself.
 */
const V2 = "https://api-open.data.gov.sg/v2/real-time/api";

/** The five PSI reporting regions, with their published representative points. */
const PSI_REGIONS: Array<{ name: string } & LatLng> = [
  { name: "north", lat: 1.41803, lng: 103.82 },
  { name: "south", lat: 1.29587, lng: 103.82 },
  { name: "east", lat: 1.35735, lng: 103.94 },
  { name: "west", lat: 1.35735, lng: 103.7 },
  { name: "central", lat: 1.35735, lng: 103.82 },
];

export function nearestPsiRegion(point: LatLng): string {
  let best = PSI_REGIONS[0];
  let bestD = Infinity;
  for (const r of PSI_REGIONS) {
    const d = haversine(point, r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best.name;
}

export type AirQuality = {
  region: string;
  psi24h: number | null;
  pm25Sub: number | null;
  updatedAt: string | null;
};

type PsiV2 = {
  data?: {
    items?: Array<{
      timestamp?: string;
      readings?: {
        psi_twenty_four_hourly?: Record<string, number>;
        pm25_sub_index?: Record<string, number>;
      };
    }>;
  };
};

export async function fetchAirQuality(point: LatLng): Promise<AirQuality> {
  const region = nearestPsiRegion(point);
  const body = await cached("nea:psi", 10 * MINUTE, () =>
    fetchJson<PsiV2>(`${V2}/psi`, { source: "NEA PSI" }),
  );
  const item = body.data?.items?.at(-1);
  return {
    region,
    psi24h: item?.readings?.psi_twenty_four_hourly?.[region] ?? null,
    pm25Sub: item?.readings?.pm25_sub_index?.[region] ?? null,
    updatedAt: item?.timestamp ?? null,
  };
}

export function psiBand(psi: number): { label: string; verdict: "good" | "ok" | "poor" } {
  if (psi <= 50) return { label: "Good", verdict: "good" };
  if (psi <= 100) return { label: "Moderate", verdict: "ok" };
  if (psi <= 200) return { label: "Unhealthy", verdict: "poor" };
  return { label: "Very unhealthy", verdict: "poor" };
}

export type Forecast = { area: string; forecast: string; updatedAt: string | null };

type ForecastV2 = {
  data?: {
    area_metadata?: Array<{ name: string; label_location: { latitude: number; longitude: number } }>;
    items?: Array<{
      timestamp?: string;
      forecasts?: Array<{ area: string; forecast: string }>;
    }>;
  };
};

/** Two-hour nowcast for the forecast area closest to the block. */
export async function fetchForecast(point: LatLng): Promise<Forecast | null> {
  const body = await cached("nea:forecast", 10 * MINUTE, () =>
    fetchJson<ForecastV2>(`${V2}/two-hr-forecast`, { source: "NEA weather forecast" }),
  );

  const areas = body.data?.area_metadata ?? [];
  const item = body.data?.items?.at(-1);
  if (!areas.length || !item?.forecasts?.length) return null;

  let bestArea = areas[0];
  let bestD = Infinity;
  for (const a of areas) {
    const d = haversine(point, { lat: a.label_location.latitude, lng: a.label_location.longitude });
    if (d < bestD) {
      bestD = d;
      bestArea = a;
    }
  }

  const match = item.forecasts.find((f) => f.area === bestArea.name);
  if (!match) return null;
  return { area: match.area, forecast: match.forecast, updatedAt: item.timestamp ?? null };
}

export type RainfallSummary = {
  /** Reading from the closest rain gauge, in mm over the last 5 minutes. */
  nearestStationName: string;
  nearestStationDistanceM: number;
  rainfallMm: number | null;
  updatedAt: string | null;
};

type RainfallV2 = {
  data?: {
    stations?: Array<{ id: string; name: string; location: { latitude: number; longitude: number } }>;
    readings?: Array<{ timestamp?: string; data?: Array<{ stationId: string; value: number }> }>;
  };
};

export async function fetchRainfall(point: LatLng): Promise<RainfallSummary | null> {
  const body = await cached("nea:rainfall", 5 * MINUTE, () =>
    fetchJson<RainfallV2>(`${V2}/rainfall`, { source: "NEA rainfall" }),
  );

  const stations = body.data?.stations ?? [];
  const reading = body.data?.readings?.at(-1);
  if (!stations.length) return null;

  let best = stations[0];
  let bestD = Infinity;
  for (const s of stations) {
    const d = haversine(point, { lat: s.location.latitude, lng: s.location.longitude });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }

  const value = reading?.data?.find((d) => d.stationId === best.id)?.value ?? null;
  return {
    nearestStationName: best.name,
    nearestStationDistanceM: Math.round(bestD),
    rainfallMm: value,
    updatedAt: reading?.timestamp ?? null,
  };
}

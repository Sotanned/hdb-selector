import { cached, DAY, HOUR } from "./cache";
import { fetchJson, UpstreamError } from "./http";

const CKAN_BASE = "https://data.gov.sg/api/action/datastore_search";

/**
 * Resource IDs on data.gov.sg. These are stable identifiers, but data.gov.sg
 * does occasionally republish a dataset under a new ID when its schema changes.
 * If a card reports "dataset not found", check the ID against the portal.
 */
export const RESOURCES = {
  /** HDB resale flat prices, Jan 2017 onwards (updated monthly). */
  resale2017: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
  /** HDB resale flat prices, Jan 2015 – Dec 2016. */
  resale2015: "d_ea9ed51da2787afaf8e51f827c304208",
  /** HDB property information by block: year completed, storeys, lifts, amenities. */
  hdbPropertyInfo: "d_23000a00c52996c50eea590ecca4bc22",
  /** MOE school directory and information. */
  schoolDirectory: "d_688b934f82c1059ed0a6993d2a829089",
} as const;

export type CkanRecord = Record<string, string | number | null>;

type CkanResponse<T> = {
  success: boolean;
  result?: {
    records: T[];
    total: number;
    _links?: { next?: string };
  };
  error?: { message?: string };
};

export type DatastoreQuery = {
  resourceId: string;
  limit?: number;
  offset?: number;
  /** Exact-match column filters, e.g. `{ town: "BEDOK", flat_type: "4 ROOM" }`. */
  filters?: Record<string, string | string[]>;
  /** Full-text search across the resource. */
  q?: string;
  sort?: string;
};

function buildUrl(query: DatastoreQuery): string {
  const params = new URLSearchParams({ resource_id: query.resourceId });
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.offset != null) params.set("offset", String(query.offset));
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.filters && Object.keys(query.filters).length > 0) {
    params.set("filters", JSON.stringify(query.filters));
  }
  return `${CKAN_BASE}?${params.toString()}`;
}

export async function datastoreSearch<T = CkanRecord>(
  query: DatastoreQuery,
  ttlMs = HOUR * 6,
): Promise<{ records: T[]; total: number }> {
  const url = buildUrl(query);
  return cached(`ckan:${url}`, ttlMs, async () => {
    const body = await fetchJson<CkanResponse<T>>(url, { source: "data.gov.sg" });
    if (!body.success || !body.result) {
      throw new UpstreamError(
        "data.gov.sg",
        null,
        body.error?.message ?? "datastore_search returned an unsuccessful response",
      );
    }
    return { records: body.result.records, total: body.result.total };
  });
}

/**
 * Page through a filtered datastore query. Capped so that a mis-specified
 * filter can never pull an entire dataset into memory.
 */
export async function datastoreSearchAll<T = CkanRecord>(
  query: Omit<DatastoreQuery, "offset">,
  maxRecords = 5_000,
  ttlMs = HOUR * 6,
): Promise<{ records: T[]; total: number; truncated: boolean }> {
  const pageSize = Math.min(query.limit ?? 1_000, 1_000);
  const out: T[] = [];
  let total = 0;

  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const page = await datastoreSearch<T>(
      { ...query, limit: pageSize, offset },
      ttlMs,
    );
    total = page.total;
    out.push(...page.records);
    if (page.records.length < pageSize || out.length >= total) break;
  }

  return { records: out.slice(0, maxRecords), total, truncated: out.length < total };
}

/**
 * Resolve a data.gov.sg dataset to a temporary download URL. Used by the seed
 * script for the geospatial (GeoJSON/KML) datasets, which are not queryable
 * through the datastore API.
 */
export async function datasetDownloadUrl(datasetId: string): Promise<string> {
  const url =
    `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`;
  return cached(`download:${datasetId}`, DAY, async () => {
    const body = await fetchJson<{ code: number; data?: { url?: string }; errMsg?: string }>(
      url,
      { source: "data.gov.sg datasets API" },
    );
    if (body.code !== 0 || !body.data?.url) {
      throw new UpstreamError(
        "data.gov.sg datasets API",
        null,
        body.errMsg ?? `No download URL for dataset ${datasetId}`,
      );
    }
    return body.data.url;
  });
}

#!/usr/bin/env node
/**
 * Downloads the amenity datasets the report needs and writes them to
 * data/amenities/<category>.json as flat point lists.
 *
 * Run it with `npm run seed`. Every source is independent: one that fails is
 * reported and skipped, and the app degrades that one card rather than
 * breaking. Re-run any time to refresh — dengue clusters in particular move
 * weekly.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "amenities");
const RAW_DIR = path.join(ROOT, "data", "raw");
const CONFIG = path.join(ROOT, "scripts", "datasets.json");

const args = new Set(process.argv.slice(2));
const only = process.argv
  .slice(2)
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  ?.split(",");

/* ------------------------------ utilities ------------------------------ */

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("  !", ...a);

async function getJson(url, { headers, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * data.gov.sg GeoJSON exports carry their attributes as an HTML table inside
 * the `Description` property rather than as real fields. Pull them back out.
 */
function parseHtmlDescription(html) {
  if (typeof html !== "string") return {};
  const out = {};
  const rowRe = /<tr[^>]*>\s*<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/gis;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, "").trim();
    const value = m[2].replace(/<[^>]+>/g, "").trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Representative point for any GeoJSON geometry: the mean of its coordinates. */
function centroid(geometry) {
  if (!geometry) return null;
  const coords = [];
  const walk = (c) => {
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      coords.push(c);
      return;
    }
    for (const child of c) walk(child);
  };
  if (geometry.type === "GeometryCollection") {
    for (const g of geometry.geometries ?? []) {
      const p = centroid(g);
      if (p) coords.push([p.lng, p.lat]);
    }
  } else if (geometry.coordinates) {
    walk(geometry.coordinates);
  }
  if (coords.length === 0) return null;
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return { lat, lng };
}

const NAME_KEYS = ["NAME", "Name", "name", "DESCRIPTION", "ADDRESSBUILDINGNAME", "INC_CRC", "LANDXADDRESSPOINT"];

function pickName(props, fallback) {
  for (const key of NAME_KEYS) {
    const v = props[key];
    if (typeof v === "string" && v.trim() && v.trim().toUpperCase() !== "NULL") return v.trim();
  }
  return fallback;
}

function geojsonToPoints(geojson, categoryPrefix) {
  const features = geojson?.features ?? [];
  const points = [];
  features.forEach((f, i) => {
    const c = centroid(f.geometry);
    if (!c) return;
    const props = { ...(f.properties ?? {}), ...parseHtmlDescription(f.properties?.Description) };
    points.push({
      id: `${categoryPrefix}-${i}`,
      name: pickName(props, `${categoryPrefix} ${i + 1}`),
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      meta: Object.fromEntries(
        Object.entries(props)
          .filter(([k, v]) => typeof v === "string" && v && k !== "Description" && v.length < 120)
          .slice(0, 6),
      ),
    });
  });
  return points;
}

/* ------------------------------- sources -------------------------------- */

async function seedLtaDatamall(cfg) {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) throw new Error("LTA_ACCOUNT_KEY is not set (get one free at datamall.lta.gov.sg)");

  const points = [];
  for (let skip = 0; skip < 10_000; skip += 500) {
    const body = await getJson(`${cfg.endpoint}?$skip=${skip}`, {
      headers: { AccountKey: key, accept: "application/json" },
    });
    const rows = body?.value ?? [];
    for (const r of rows) {
      const lat = Number(r.Latitude);
      const lng = Number(r.Longitude);
      if (!lat || !lng) continue;
      points.push({
        id: `bus-${r.BusStopCode}`,
        name: r.Description || r.BusStopCode,
        kind: "Bus stop",
        lat,
        lng,
        meta: { code: String(r.BusStopCode), road: r.RoadName ?? "" },
      });
    }
    if (rows.length < 500) break;
    await sleep(200);
  }
  return points;
}

async function oneMapToken() {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) {
    throw new Error("ONEMAP_EMAIL / ONEMAP_PASSWORD are not set (register free at onemap.gov.sg)");
  }
  const res = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`OneMap token request failed (HTTP ${res.status})`);
  const body = await res.json();
  if (!body.access_token) throw new Error("OneMap token response had no access_token");
  return body.access_token;
}

let tokenPromise = null;
const getToken = () => (tokenPromise ??= oneMapToken());

async function seedOneMapTheme(cfg) {
  const token = await getToken();
  const body = await getJson(
    `https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme?queryName=${encodeURIComponent(cfg.themeName)}`,
    { headers: { Authorization: token } },
  );

  const rows = body?.SrchResults ?? [];
  const points = [];
  for (const [i, r] of rows.entries()) {
    // The first element of SrchResults is a metadata header, not a place.
    if (!r.LatLng) continue;
    const [lat, lng] = String(r.LatLng).split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({
      id: `${cfg.category}-${i}`,
      name: r.NAME || r.DESCRIPTION || `${cfg.category} ${i + 1}`,
      kind: r.CATEGORY || undefined,
      lat,
      lng,
      meta: Object.fromEntries(
        ["ADDRESSSTREETNAME", "ADDRESSPOSTALCODE", "ADDRESSBLOCKHOUSENUMBER", "HYPERLINK"]
          .filter((k) => typeof r[k] === "string" && r[k])
          .map((k) => [k.replace("ADDRESS", "").toLowerCase(), r[k]]),
      ),
    });
  }
  if (points.length === 0) {
    throw new Error(
      `theme "${cfg.themeName}" returned no located results — the query name may be wrong`,
    );
  }
  return points;
}

async function seedCkanPostal(cfg) {
  // 1. Pull the rows.
  const rows = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const url =
      `https://data.gov.sg/api/action/datastore_search?resource_id=${cfg.resourceId}` +
      `&limit=500&offset=${offset}`;
    const body = await getJson(url);
    const page = body?.result?.records ?? [];
    rows.push(...page);
    if (page.length < 500) break;
  }
  if (rows.length === 0) throw new Error(`resource ${cfg.resourceId} returned no rows`);

  // 2. Geocode each postal code through OneMap's open search endpoint.
  log(`    geocoding ${rows.length} postal codes (throttled, ~1–2 min)…`);
  const points = [];
  let failures = 0;

  for (const [i, r] of rows.entries()) {
    const postal = String(r[cfg.postalField] ?? "").trim();
    const name = String(r[cfg.nameField] ?? "").trim();
    if (!/^\d{6}$/.test(postal)) {
      failures++;
      continue;
    }
    try {
      const body = await getJson(
        `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y&pageNum=1`,
      );
      const hit = body?.results?.[0];
      if (!hit) {
        failures++;
      } else {
        points.push({
          id: `${cfg.category}-${postal}-${i}`,
          name,
          kind: cfg.kindField ? String(r[cfg.kindField] ?? "").trim() : undefined,
          lat: Number(hit.LATITUDE),
          lng: Number(hit.LONGITUDE),
          meta: Object.fromEntries(
            (cfg.metaFields ?? [])
              .map((f) => [f === cfg.kindField ? "level" : f, String(r[f] ?? "").trim()])
              .filter(([, v]) => v && v.toUpperCase() !== "NA"),
          ),
        });
      }
    } catch {
      failures++;
    }
    // Be a good citizen with a public, unauthenticated endpoint.
    await sleep(120);
    if ((i + 1) % 100 === 0) log(`      ${i + 1}/${rows.length}…`);
  }

  if (failures) warn(`${failures} of ${rows.length} rows could not be geocoded and were dropped`);
  if (points.length === 0) throw new Error("no rows could be geocoded");
  return points;
}

async function seedGeojsonDataset(cfg) {
  if (!cfg.datasetId) throw new Error("no datasetId configured");
  const poll = await getJson(
    `https://api-open.data.gov.sg/v1/public/api/datasets/${cfg.datasetId}/poll-download`,
  );
  if (poll?.code !== 0 || !poll?.data?.url) {
    throw new Error(poll?.errMsg ?? `dataset ${cfg.datasetId} has no download URL`);
  }
  const geojson = await getJson(poll.data.url, { timeoutMs: 60_000 });
  return geojsonToPoints(geojson, cfg.category);
}

async function seedLocalGeojson(cfg) {
  const file = path.join(RAW_DIR, cfg.file);
  const geojson = JSON.parse(await readFile(file, "utf8"));
  return geojsonToPoints(geojson, cfg.category);
}

const HANDLERS = {
  "lta-datamall": seedLtaDatamall,
  "onemap-theme": seedOneMapTheme,
  "ckan-postal": seedCkanPostal,
  "geojson-dataset": seedGeojsonDataset,
  "local-geojson": seedLocalGeojson,
};

/* --------------------------------- main --------------------------------- */

async function main() {
  const config = JSON.parse(await readFile(CONFIG, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const sources = config.sources.filter((s) => !only || only.includes(s.category));
  if (sources.length === 0) {
    console.error(`No sources match --only=${only?.join(",")}`);
    process.exit(1);
  }

  const succeeded = [];
  const failed = [];

  for (const cfg of sources) {
    const handler = HANDLERS[cfg.kind];
    log(`\n→ ${cfg.category} (${cfg.kind})`);
    if (!handler) {
      failed.push([cfg, `unknown source kind "${cfg.kind}"`]);
      warn(`unknown source kind "${cfg.kind}"`);
      continue;
    }
    try {
      const points = await handler(cfg);
      const payload = {
        category: cfg.category,
        source: cfg.source,
        sourceUrl: cfg.sourceUrl,
        fetchedAt: new Date().toISOString(),
        points,
      };
      await writeFile(
        path.join(OUT_DIR, `${cfg.category}.json`),
        JSON.stringify(payload, null, args.has("--pretty") ? 2 : 0),
      );
      log(`  ✓ ${points.length} points written`);
      succeeded.push(cfg.category);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(message);
      failed.push([cfg, message]);
    }
  }

  log(`\n${"=".repeat(60)}`);
  log(`Seeded ${succeeded.length}/${sources.length}: ${succeeded.join(", ") || "none"}`);

  if (failed.length) {
    log(`\nNot seeded — the app will show these cards as unavailable:`);
    for (const [cfg, message] of failed) {
      log(`  • ${cfg.category}: ${message}`);
      if (cfg.verified === false) {
        log(
          `      This source identifier was never verified. Find the dataset on`,
        );
        log(
          `      data.gov.sg, then set "datasetId" and "kind": "geojson-dataset"`,
        );
        log(`      for it in scripts/datasets.json, or drop a .geojson into data/raw/`);
        log(`      and use "kind": "local-geojson".`);
      }
    }
  }

  const existing = await readdir(OUT_DIR).catch(() => []);
  log(`\ndata/amenities now holds: ${existing.filter((f) => f.endsWith(".json")).join(", ") || "nothing"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

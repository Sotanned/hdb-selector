# HDB Selector

A decision portal for people buying a resale or BTO flat in Singapore.

It works in two directions.

**You know the address.** Enter a block and get a report scoring it on six
pillars — price, getting around, schools, daily living, sport and green space,
environment — from Singapore's open government data, weighted the way your
household actually cares about, with a shortlist to compare candidates.

**You don't know where to look.** The map scores every inhabited 400 m square in
Singapore on the same six pillars and shades the island by how well each area
matches your weighting. Drag a slider and it repaints — a family chasing a P1
place and a couple who want a 6-minute walk to the MRT see different maps.

## Why it exists

Property listings tell you the asking price and the floor area. They do not tell
you that the block has 62 years of lease left, that the nearest primary school is
1.4 km away and therefore outside the P1 priority band, or that the town median
for the same flat type is $60k lower. All of that is public data. This puts it on
one page.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

That already works: address search, resale prices, block information and live
NEA readings are all open endpoints needing no key.

To fill in the amenity pillars — stations, bus stops, schools, hawker centres,
supermarkets, clinics, malls, parks, sports facilities, dengue clusters — copy
`.env.example` to `.env.local`, add the free credentials it describes, then:

```bash
npm run seed         # downloads the amenity datasets into data/amenities/
```

Until you do, those cards read **"not downloaded yet"** rather than showing a
score. That distinction is deliberate: a blank must never be mistaken for
"there is nothing nearby".

Re-run `npm run seed` periodically. Dengue clusters in particular change weekly.
`npm run seed -- --only=dengue,hawker` refreshes a subset.

## How it is put together

```
src/lib/          the data layer — one module per concern
  datagov.ts        data.gov.sg CKAN datastore client (resale prices, block info)
  onemap.ts         address search, routing, reverse geocoding
  environment.ts    NEA real-time PSI, rainfall, two-hour forecast
  amenities.ts      seeded point datasets + radius/nearest queries
  spatial.ts        uniform-grid spatial hash, for the island-wide sweep
  resale.ts         transaction parsing, medians, quartiles, year-on-year
  hdb.ts            block facts and town resolution
  towns.ts          town centres and the per-town price table
  affordability.ts  MSR/TDSR, LTV, stamp duty, grant estimates
  scoring.ts        the six pillar scores and the weighted fit score
  report.ts         orchestrates all of the above for one address
  mapGrid.ts        the same scoring, swept across every 400 m square
  mapTypes.ts       the /api/map wire contract, shared with the browser
  mapPalette.ts     the sequential ramp and its percentile bands
src/app/          Next.js App Router pages and API routes
src/components/   UI
scripts/          the seed script and its dataset configuration
```

Three design decisions are worth knowing about:

**Failure is isolated per source.** `buildReport` wraps every upstream call, and a
dataset that is down, rate-limited or not yet seeded degrades its own card and
leaves its own pillar unscored. It never fails the report, and it is never
silently replaced with a zero. The report footer lists every source and whether
it answered.

**Weights and money stay in the browser.** Your priorities, your income, your CPF
balance and your shortlist live in `localStorage` and are never sent anywhere.
The fit score is therefore computed client-side.

**The judgement calls are in one file.** Every scoring threshold — how much a
10-minute walk to the MRT is worth, where the lease-decay curve falls off — lives
in `src/lib/scoring.ts` with a comment saying why. They are opinions, and they
are meant to be argued with. The map calls those same functions rather than
reimplementing them, so a threshold change moves the map and the report together.

### How the map performs

Scoring ~3,000 squares against a dozen datasets is ~10^8 distance tests done
naively. `spatial.ts` buckets each dataset into 1 km cells so a radius query only
visits the buckets it touches; the full island sweep then takes well under a
second, is cached against the seed files' mtimes, and ships to the browser as
~125 KB of columnar tuples. Re-weighting happens entirely client-side, so moving
a slider repaints without another request.

## Data sources

| Source | Provides |
|---|---|
| HDB resale flat prices (data.gov.sg) | Median and quartile prices, monthly trend, year-on-year |
| HDB property information (data.gov.sg) | Year completed, storeys, units, precinct facilities |
| MOE school directory (data.gov.sg) | Primary and secondary schools, geocoded by postal code |
| NEA real-time API (data.gov.sg) | PSI, rainfall, two-hour weather forecast |
| LTA DataMall | Bus stop locations |
| OneMap (SLA) | Address search, coordinates, amenity themes, walking routes |

The `/method` page in the app documents what each dataset is used for, its
caveats, and how every pillar score is derived.

## Dependencies

Next 16 (Node 20.9+), React 19, Tailwind 4, Leaflet for the map. `npm audit`
reports clean.

One pin is deliberate: **ESLint stays on 9.x**. ESLint 10 is out, and npm warns
that 9.x is on maintenance support, but `eslint-config-next` still bundles
`eslint-plugin-react@7.37.5`, which caps at ESLint 9 and throws on 10's rule
context API. That warning is a support-lifecycle notice, not a vulnerability.
Revisit once `eslint-plugin-react` ships ESLint 10 support.

Linting runs as `npm run lint` (`eslint .` against `eslint.config.mjs`) — Next 16
removed the `next lint` command.

## Known limits

- **Resale prices are historical, not a forecast**, are published a month or two
  in arrears, and exclude any cash-over-valuation paid on top.
- **The finance module encodes policy parameters that change.** LTV ceilings,
  grant amounts, servicing ratios and stamp-duty bands are gathered in `POLICY`
  in `src/lib/affordability.ts` with the date they were last reviewed, and are
  shown in the app's Assumptions panel. Check them against hdb.gov.sg and
  iras.gov.sg before relying on any figure.
- **Grant estimates ignore** citizenship, employment history, prior housing
  subsidies and the lease-coverage rule. HDB checks all of those.
- **Distances are straight-line** with a 1.3× detour factor, unless OneMap
  routing credentials are configured.
- **Some seed sources are unverified.** Entries in `scripts/datasets.json`
  marked `"verified": false` use an identifier that has not been confirmed
  against the live portal. If the seed reports one as failed, the console output
  tells you exactly what to change.
- **No URA Master Plan or upcoming-MRT data yet.** Announced changes to an area
  are not reflected.
- **On the map, the financial pillar is town-level**, not square-level: a square
  takes its nearest town centre's median price. Town attribution is
  nearest-centre, which approximates real town boundaries.
- **Map shading is by percentile**, not absolute score, so an area being dark
  means "better than most of Singapore for you", not "good in absolute terms".

This is a research tool, not financial, legal or property advice.

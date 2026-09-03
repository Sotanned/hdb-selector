# HDB Selector

A decision portal for people buying a resale or BTO flat in Singapore.

You give it an address and tell it what your household cares about. It scores
the block on six pillars — price, getting around, schools, daily living, sport
and green space, environment — from Singapore's open government data, weights
them the way you asked, and lets you shortlist and compare candidates.

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
  resale.ts         transaction parsing, medians, quartiles, year-on-year
  hdb.ts            block facts and town resolution
  affordability.ts  MSR/TDSR, LTV, stamp duty, grant estimates
  scoring.ts        the six pillar scores and the weighted fit score
  report.ts         orchestrates all of the above for one address
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
are meant to be argued with.

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

This is a research tool, not financial, legal or property advice.

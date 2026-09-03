import Link from "next/link";
import { POLICY } from "@/lib/affordability";

export const metadata = { title: "Method and sources — HDB Selector" };

const SOURCES = [
  {
    name: "HDB resale flat prices",
    provider: "HDB via data.gov.sg",
    used: "Median and quartile prices per block and per town, monthly trend, year-on-year change.",
    caveat: "Published monthly, a month or two in arrears. Excludes cash-over-valuation.",
    href: "https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view",
  },
  {
    name: "HDB property information",
    provider: "HDB via data.gov.sg",
    used: "Year of completion, storeys, dwelling units, whether the precinct has its own market, hawker centre or multi-storey carpark.",
    caveat: "Remaining lease is derived as 99 years from completion.",
    href: "https://data.gov.sg/datasets/d_23000a00c52996c50eea590ecca4bc22/view",
  },
  {
    name: "School directory",
    provider: "MOE via data.gov.sg",
    used: "Primary schools inside the 1 km and 2 km registration bands; secondary schools within 2 km.",
    caveat:
      "Geocoded from each school's postal code, so the point is the campus address, not its gate.",
    href: "https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view",
  },
  {
    name: "Bus stop locations",
    provider: "LTA DataMall",
    used: "Bus stops within 400 m and 500 m.",
    caveat: "Counts stops, not the number of services calling at them.",
    href: "https://datamall.lta.gov.sg/",
  },
  {
    name: "PSI, rainfall and the two-hour forecast",
    provider: "NEA via data.gov.sg",
    used: "Air quality for the region the block sits in, plus current conditions.",
    caveat:
      "PSI is regional and largely island-wide during haze, so it separates towns far less than it separates days.",
    href: "https://data.gov.sg/",
  },
  {
    name: "Amenity locations",
    provider: "OneMap themes (SLA, NEA, NParks, SportSG, MOH)",
    used: "MRT and LRT stations, hawker centres, supermarkets, clinics, malls, parks, sports facilities, preschools, dengue clusters.",
    caveat: "Refreshed only when you re-run the seed script — dengue clusters move weekly.",
    href: "https://www.onemap.gov.sg/",
  },
  {
    name: "Address search and coordinates",
    provider: "OneMap, Singapore Land Authority",
    used: "Turning what you type into a block, street and coordinate pair.",
    caveat: null,
    href: "https://www.onemap.gov.sg/",
  },
];

const PILLAR_METHOD = [
  {
    title: "Financial",
    body: "Two signals. The block's median price for your chosen flat type against the town median for the same type — cheaper scores higher, a large premium scores poorly. And the remaining lease, which falls away sharply below about 65 years because CPF usage becomes restricted and the pool of future buyers narrows. Lease is weighted more heavily than price.",
  },
  {
    title: "Getting around",
    body: "Walking time to the nearest MRT or LRT station carries twice the weight of anything else here; bus stops within 400 m and straight-line distance to Raffles Place make up the rest. Walking times are straight-line distance × 1.3 at 80 m per minute, unless OneMap routing credentials are configured, in which case real routes are used.",
  },
  {
    title: "Schools",
    body: "Having any primary school inside the 1 km band dominates, because that band carries the highest priority in P1 registration — going from zero to one matters far more than going from two to three. Secondary schools within 2 km and preschools within 500 m contribute less.",
  },
  {
    title: "Daily living",
    body: "Counts of hawker centres and supermarkets within 800 m, and clinics and malls within 1 km, each on its own saturating curve. Two hawker centres is much better than none; six is not much better than two.",
  },
  {
    title: "Sport and green space",
    body: "Sports facilities and parks within 1 km, plus the walk to the closest facility.",
  },
  {
    title: "Environment",
    body: "Current regional PSI and the number of active dengue clusters within 500 m. Dengue is weighted higher than PSI because it genuinely varies between blocks, while haze does not.",
  },
];

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Method and sources</h1>
        <p className="muted mt-2 leading-relaxed">
          Every number in a report traces back to a public dataset. Where a source is
          unavailable the pillar is left unscored rather than filled in with a guess, so a
          blank here always means &ldquo;we don&rsquo;t know&rdquo; and never &ldquo;there is
          nothing there&rdquo;.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold">How each pillar is scored</h2>
        <p className="muted mt-1 text-sm">
          Each pillar produces a 0–100 score from its own signals, then your weights blend
          them into the headline fit score. Pillars you set to <em>Ignore</em> are excluded
          entirely.
        </p>
        <div className="mt-4 space-y-4">
          {PILLAR_METHOD.map((p) => (
            <div key={p.title} className="card">
              <h3 className="text-sm font-semibold">{p.title}</h3>
              <p className="muted mt-1.5 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="muted mt-4 text-sm leading-relaxed">
          The thresholds behind those curves are judgement calls, not facts. They live in one
          file (<code className="rounded bg-[var(--surface-2)] px-1 text-xs">src/lib/scoring.ts</code>)
          precisely so they can be argued with and changed.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The map</h2>
        <p className="muted mt-1 text-sm leading-relaxed">
          The map divides Singapore into 400 m squares and scores each one on the same six
          pillars, using the same functions as a single block&rsquo;s report — so the two can
          never drift apart. A square is drawn only if it has a bus stop within 700 m, which
          is what keeps the map to inhabited land without needing a coastline dataset.
        </p>
        <p className="muted mt-2 text-sm leading-relaxed">
          Two things work differently there. The financial pillar is <strong>town-level</strong>,
          not block-level: a square is attributed to its nearest town centre and scored on
          that town&rsquo;s median price for the chosen flat type against the island median.
          It has no lease component, because a square has no lease. And the shading is by{" "}
          <strong>percentile</strong> rather than absolute score — a weighted fit score has no
          natural zero, and absolute bands would paint the whole island one colour for anyone
          with balanced priorities. The tooltip always shows the raw score.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Money</h2>
        <p className="muted mt-1 text-sm leading-relaxed">
          The affordability calculator sizes a loan against the Mortgage Servicing Ratio
          ({(POLICY.msr * 100).toFixed(0)}% of gross income) and the Total Debt Servicing Ratio
          ({(POLICY.tdsr * 100).toFixed(0)}%), both stress-tested at{" "}
          {(POLICY.stressRate * 100).toFixed(1)}%, then against the loan-to-value ceiling given
          your CPF and cash. It takes the lower of the two.
        </p>
        <p className="muted mt-2 text-sm leading-relaxed">
          These parameters were last reviewed in <strong>{POLICY.lastReviewed}</strong>. LTV
          limits, grant ceilings and stamp-duty bands all change; check the figures against{" "}
          <a
            href={POLICY.reference}
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            hdb.gov.sg
          </a>{" "}
          before you rely on them. Grant estimates ignore citizenship, employment history,
          prior subsidies and the lease-coverage rule, all of which HDB does check.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Datasets</h2>
        <div className="mt-4 space-y-3">
          {SOURCES.map((s) => (
            <div key={s.name} className="card">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <span className="muted text-xs">{s.provider}</span>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs underline underline-offset-2"
                >
                  Source
                </a>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">{s.used}</p>
              {s.caveat && <p className="muted mt-1 text-xs leading-relaxed">{s.caveat}</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">What this deliberately does not do</h2>
        <ul className="muted mt-2 space-y-1.5 text-sm leading-relaxed">
          <li>• It does not predict prices. Past medians are not a forecast.</li>
          <li>
            • It does not rank schools. Proximity is a registration fact; quality is a
            judgement this app has no data for.
          </li>
          <li>
            • It does not see the unit — the floor, the facing, the afternoon sun, the noise
            from the expressway, or how the corridor smells at 7pm. Go and stand there.
          </li>
          <li>• It does not know about upcoming URA Master Plan changes or new MRT lines.</li>
        </ul>
      </section>

      <div>
        <Link href="/" className="btn btn-primary">
          Back to search
        </Link>
      </div>
    </div>
  );
}

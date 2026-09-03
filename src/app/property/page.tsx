import { Suspense } from "react";
import Link from "next/link";
import { buildReport, type PropertyReport } from "@/lib/report";
import { isInSingapore } from "@/lib/geo";
import { distance, money, monthLabel, timeAgo, titleCase } from "@/lib/format";
import { AffordabilityCalculator } from "@/components/AffordabilityCalculator";
import { AmenityList } from "@/components/AmenitySection";
import { FitSummary } from "@/components/FitSummary";
import { FlatTypePicker } from "@/components/FlatTypePicker";
import { PillarCard } from "@/components/PillarCard";
import { PriceTrendChart } from "@/components/PriceTrendChart";
import { SearchBox } from "@/components/SearchBox";
import { ShortlistButton } from "@/components/ShortlistButton";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function PropertyPage({ searchParams }: { searchParams: Params }) {
  const p = await searchParams;
  const lat = Number(one(p.lat));
  const lng = Number(one(p.lng));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInSingapore({ lat, lng })) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="text-xl font-semibold">Pick a Singapore address</h1>
        <p className="muted mt-2 text-sm">
          That link is missing valid coordinates. Search for a block to start again.
        </p>
        <div className="mt-6">
          <SearchBox autoFocus />
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<ReportSkeleton />}>
      <Report
        lat={lat}
        lng={lng}
        address={one(p.address) ?? "Selected location"}
        block={one(p.block)}
        street={one(p.street)}
        postal={one(p.postal)}
        flatType={one(p.flatType) ?? undefined}
      />
    </Suspense>
  );
}

async function Report(props: {
  lat: number;
  lng: number;
  address: string;
  block: string | null;
  street: string | null;
  postal: string | null;
  flatType?: string;
}) {
  const report = await buildReport(props);

  return (
    <div className="space-y-6">
      <ReportHeader report={report} />
      <FitSummary pillars={report.pillars} />

      <div className="grid gap-5 lg:grid-cols-2">
        {report.pillars.map((pillar) => (
          <PillarCard key={pillar.pillar} pillar={pillar} />
        ))}
      </div>

      <PriceSection report={report} />
      <AffordabilityCalculator
        askingPrice={report.prices.block?.median ?? report.prices.town?.median ?? null}
        flatType={report.prices.flatType}
      />
      <NeighbourhoodSection report={report} />
      <SourcesSection report={report} />
    </div>
  );
}

/* -------------------------------- header -------------------------------- */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">
      {children}
    </span>
  );
}

function ReportHeader({ report }: { report: PropertyReport }) {
  const { request, blockInfo, town, remainingLeaseYears } = report;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {titleCase(request.address)}
          </h1>
          <p className="muted mt-1 text-sm">
            {[town && titleCase(town), request.postal && `Singapore ${request.postal}`]
              .filter(Boolean)
              .join(" · ") || "Singapore"}
          </p>
        </div>
        <ShortlistButton
          address={request.address}
          block={request.block}
          street={request.street}
          postal={request.postal}
          lat={request.lat}
          lng={request.lng}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {blockInfo?.yearCompleted && <Chip>Built {blockInfo.yearCompleted}</Chip>}
        {remainingLeaseYears != null && <Chip>{remainingLeaseYears} years of lease left</Chip>}
        {blockInfo?.maxFloorLevel && <Chip>{blockInfo.maxFloorLevel} storeys</Chip>}
        {blockInfo?.totalDwellingUnits && <Chip>{blockInfo.totalDwellingUnits} units</Chip>}
        {blockInfo?.hasMarketOrHawker && <Chip>Market / hawker in the block</Chip>}
        {blockInfo?.hasMultiStoreyCarpark && <Chip>Multi-storey carpark</Chip>}
        {blockInfo?.hasCommercial && <Chip>Shops on the ground floor</Chip>}
        <Chip>{report.cbdDistanceKm.toFixed(1)} km from Raffles Place</Chip>
      </div>

      {report.prices.availableFlatTypes.length > 1 && (
        <FlatTypePicker
          options={report.prices.availableFlatTypes}
          selected={report.prices.flatType}
        />
      )}
    </header>
  );
}

/* --------------------------------- price -------------------------------- */

function PriceSection({ report }: { report: PropertyReport }) {
  const { prices, town } = report;
  const hasBlock = prices.block != null && prices.block.count > 0;

  return (
    <section className="card">
      <h2 className="text-sm font-semibold">
        What flats here actually sell for
        {prices.flatType ? ` — ${titleCase(prices.flatType)}` : ""}
      </h2>

      {!hasBlock && !prices.town && (
        <p className="muted mt-2 text-sm">
          No recorded resale transactions for this block or town in the window we looked at.
          That usually means a newer BTO estate still inside its minimum occupation period,
          or an address that is not HDB.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {hasBlock && (
          <PriceStat
            label="This block, last 3 years"
            value={money(prices.block!.median)}
            note={`${prices.block!.count} sale${prices.block!.count === 1 ? "" : "s"} · ${money(prices.block!.p25)}–${money(prices.block!.p75)} middle half`}
            emphasis
          />
        )}
        {prices.town && (
          <PriceStat
            label={`${titleCase(town ?? "Town")}, last 2 years`}
            value={money(prices.town.median)}
            note={`${prices.town.count} sales${prices.town.medianPsf ? ` · ${money(prices.town.medianPsf)} psf` : ""}`}
          />
        )}
        {prices.townYoy != null && (
          <PriceStat
            label="Town median, year on year"
            value={`${prices.townYoy >= 0 ? "+" : ""}${(prices.townYoy * 100).toFixed(1)}%`}
            note="Latest 6 months against the same 6 months a year earlier"
          />
        )}
      </div>

      {prices.trend.length >= 2 && (
        <div className="mt-6">
          <PriceTrendChart
            points={prices.trend}
            caption={`Median resale price — ${titleCase(prices.flatType ?? "all flat types")} in ${titleCase(town ?? "this town")}`}
          />
        </div>
      )}

      {prices.recentTransactions.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium">Recent sales in this block</h3>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Storey</th>
                  <th className="px-3 py-2 text-right font-medium">Area</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {prices.recentTransactions.map((t, i) => (
                  <tr key={`${t.month}-${t.storeyRange}-${i}`} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{monthLabel(t.month)}</td>
                    <td className="px-3 py-2">{titleCase(t.flatType)}</td>
                    <td className="muted px-3 py-2">{t.storeyRange.toLowerCase()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.floorAreaSqm} m²</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {money(t.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-2 text-xs">
            Recorded resale prices from HDB. They exclude any cash-over-valuation paid on top
            and are published a month or two in arrears.
          </p>
        </div>
      )}
    </section>
  );
}

function PriceStat({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="muted text-xs">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${emphasis ? "text-2xl" : "text-lg"}`}>
        {value}
      </div>
      {note && <div className="muted mt-0.5 text-xs leading-snug">{note}</div>}
    </div>
  );
}

/* ----------------------------- neighbourhood ---------------------------- */

function NeighbourhoodSection({ report }: { report: PropertyReport }) {
  const { nearby, amenityStatus, environment } = report;
  const st = (k: string) => (amenityStatus[k] === "ok" ? "ok" : "not-seeded") as "ok" | "not-seeded";

  const primaries = nearby.school.filter((s) =>
    (s.meta?.level ?? s.kind ?? "").toUpperCase().includes("PRIMARY"),
  );

  return (
    <section className="card">
      <h2 className="text-sm font-semibold">The neighbourhood</h2>
      <p className="muted mt-1 text-sm">
        Distances are straight-line; walking times assume a 1.3× detour at a normal pace.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AmenityList title="Nearest stations" items={nearby.mrt} status={st("mrt")} limit={3} />
        <AmenityList
          title="Bus stops within 500 m"
          items={nearby.busStop}
          status={st("busStop")}
          limit={5}
        />
        <AmenityList
          title="Primary schools within 2 km"
          items={primaries}
          status={st("school")}
          limit={6}
          emptyNote="No primary school within 2 km."
        />
        <AmenityList title="Hawker centres" items={nearby.hawker} status={st("hawker")} />
        <AmenityList title="Supermarkets" items={nearby.supermarket} status={st("supermarket")} />
        <AmenityList title="Clinics" items={nearby.clinic} status={st("clinic")} />
        <AmenityList title="Parks" items={nearby.park} status={st("park")} />
        <AmenityList title="Sports facilities" items={nearby.sports} status={st("sports")} />
        <AmenityList title="Shopping malls" items={nearby.mall} status={st("mall")} />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-medium">Right now</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {environment.psi24h != null && (
            <EnvRow
              label={`PSI (${environment.psiRegion ?? "region"})`}
              value={String(Math.round(environment.psi24h))}
            />
          )}
          {environment.forecast && <EnvRow label="Weather" value={environment.forecast} />}
          {environment.rainfallMm != null && (
            <EnvRow
              label={`Rain at ${titleCase(environment.rainfallStation ?? "nearest gauge")}`}
              value={`${environment.rainfallMm} mm / 5 min`}
            />
          )}
          {nearby.dengue.length > 0 && (
            <EnvRow
              label="Nearest active dengue cluster"
              value={distance(nearby.dengue[0].distanceM)}
            />
          )}
        </dl>
        {environment.updatedAt && (
          <p className="muted mt-2 text-xs">NEA reading from {timeAgo(environment.updatedAt)}.</p>
        )}
      </div>
    </section>
  );
}

function EnvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--border)] pb-1">
      <dt className="muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/* -------------------------------- sources ------------------------------- */

function SourcesSection({ report }: { report: PropertyReport }) {
  const failed = report.sources.filter((s) => !s.ok);
  return (
    <section className="card">
      <h2 className="text-sm font-semibold">Where these numbers came from</h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {report.sources.map((s) => (
          <li
            key={s.source}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{
              borderColor: s.ok ? "var(--border)" : "var(--poor)",
              color: s.ok ? "var(--text-muted)" : "var(--poor)",
            }}
            title={s.detail}
          >
            {s.source}
            {s.ok ? "" : " — unavailable"}
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <p className="muted mt-3 text-xs">
          {failed.length} source{failed.length > 1 ? "s" : ""} could not be reached, so the
          pillars that depend on {failed.length > 1 ? "them" : "it"} are left unscored rather
          than guessed.
        </p>
      )}
      <p className="muted mt-3 text-xs">
        Report generated {timeAgo(report.generatedAt)}.{" "}
        <Link href="/method" className="underline underline-offset-2">
          How the scores are calculated
        </Link>
        .
      </p>
    </section>
  );
}

/* ------------------------------- skeleton ------------------------------- */

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Building the report">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      <div className="h-32 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
        ))}
      </div>
    </div>
  );
}

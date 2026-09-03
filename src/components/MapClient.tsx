"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  MAP_FLAT_TYPES,
  NO_DATA,
  PILLAR_ORDER,
  type GridCellTuple,
  type MapGrid,
  type MapPick,
} from "@/lib/mapTypes";
import { BANDS, bandThresholds, ramp } from "@/lib/mapPalette";
import { money, monthLabel, titleCase } from "@/lib/format";
import { useWeights } from "@/lib/store";
import { CATEGORY_LABELS, PILLARS, type PillarId, type Weights } from "@/lib/types";
import { WeightsPanel } from "./WeightsPanel";
import { ScoreBar } from "./Score";
import type { HoverInfo, MapCell } from "./FitMap";

/** Same query contract as `SearchBox`'s address results, built from a pick instead. */
function pickHref(pick: MapPick): string {
  const p = new URLSearchParams({
    lat: String(pick.lat),
    lng: String(pick.lng),
    address: pick.address,
  });
  if (pick.block) p.set("block", pick.block);
  if (pick.street) p.set("street", pick.street);
  return `/property?${p.toString()}`;
}

const FitMap = dynamic(() => import("./FitMap").then((m) => m.FitMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center rounded-xl bg-[var(--surface-2)]">
      <span className="muted text-sm">Loading map…</span>
    </div>
  ),
});

/** Weighted blend of one cell's pillar scores, ignoring pillars with no data. */
function fitOf(cell: GridCellTuple, weights: Weights): number | null {
  let sum = 0;
  let covered = 0;
  for (let i = 0; i < PILLAR_ORDER.length; i++) {
    const score = cell[3 + i];
    const w = weights[PILLAR_ORDER[i]];
    if (w <= 0 || score === NO_DATA) continue;
    sum += score * w;
    covered += w;
  }
  return covered > 0 ? sum / covered : null;
}

export function MapClient() {
  const { weights, setWeights, reset, ready } = useWeights();
  const [flatType, setFlatType] = useState("4 ROOM");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<MapCell | null>(null);
  const [picks, setPicks] = useState<{ key: string; items: MapPick[]; error: string | null }>({
    key: "",
    items: [],
    error: null,
  });

  // One piece of state keyed by the request it answers. `loading` is then
  // derived rather than toggled, so the effect never writes state synchronously.
  const [result, setResult] = useState<{
    key: string;
    grid: MapGrid | null;
    error: string | null;
  }>({ key: "", grid: null, error: null });

  const loading = result.key !== flatType;
  const grid = result.key === flatType ? result.grid : null;
  const error = result.key === flatType ? result.error : null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/map?flatType=${encodeURIComponent(flatType)}`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        setResult(
          r.ok
            ? { key: flatType, grid: body as MapGrid, error: null }
            : { key: flatType, grid: null, error: body.error ?? "Could not build the map." },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ key: flatType, grid: null, error: "Could not reach the server." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flatType]);

  // Re-weighting is pure arithmetic over data already in the browser, so
  // dragging a slider repaints the island without another request.
  const scored = useMemo(() => {
    if (!grid) return { cells: [] as MapCell[], thresholds: [] as number[] };
    const cells: MapCell[] = [];
    for (const c of grid.cells) {
      const fit = fitOf(c, weights);
      if (fit == null) continue;
      cells.push({ lat: c[0], lng: c[1], fit, townIndex: c[2] });
    }
    return { cells, thresholds: bandThresholds(cells.map((c) => c.fit)) };
  }, [grid, weights]);

  /** Average fit per town, best first — the answer most people actually want. */
  const townRanking = useMemo(() => {
    if (!grid) return [];
    const totals = new Map<number, { sum: number; count: number }>();
    for (const c of scored.cells) {
      if (c.townIndex === NO_DATA) continue;
      const entry = totals.get(c.townIndex) ?? { sum: 0, count: 0 };
      entry.sum += c.fit;
      entry.count += 1;
      totals.set(c.townIndex, entry);
    }
    return [...totals.entries()]
      .map(([index, { sum, count }]) => ({
        town: grid.towns[index],
        median: grid.townMedians[index],
        fit: Math.round(sum / count),
        cells: count,
      }))
      .filter((t) => t.town && t.cells >= 3)
      .sort((a, b) => b.fit - a.fit);
  }, [grid, scored.cells]);

  const selectedDetail = useMemo(() => {
    if (!grid || !selected) return null;
    // Recover the full pillar row for the clicked cell.
    const row = grid.cells.find(
      (c) => c[0] === selected.lat && c[1] === selected.lng,
    );
    if (!row) return null;
    return {
      town: row[2] === NO_DATA ? null : grid.towns[row[2]],
      median: row[2] === NO_DATA ? null : grid.townMedians[row[2]],
      pillars: PILLAR_ORDER.map((id, i) => ({
        id,
        score: row[3 + i] === NO_DATA ? null : row[3 + i],
      })),
      fit: Math.round(selected.fit),
    };
  }, [grid, selected]);

  // Clicking an area should immediately answer "so what's actually here?" —
  // a few real blocks that have sold recently, not just a score.
  const pickKey = selectedDetail?.town ? `${selectedDetail.town}:${flatType}` : null;
  const picksLoading = pickKey != null && picks.key !== pickKey;
  const picksItems = pickKey != null && picks.key === pickKey ? picks.items : [];
  const picksError = pickKey != null && picks.key === pickKey ? picks.error : null;

  useEffect(() => {
    const town = selectedDetail?.town;
    if (!town) return;
    const key = `${town}:${flatType}`;
    let cancelled = false;
    fetch(`/api/map/picks?town=${encodeURIComponent(town)}&flatType=${encodeURIComponent(flatType)}`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        setPicks({
          key,
          items: body.picks ?? [],
          error: r.ok ? null : (body.error ?? "Could not load recent sales."),
        });
      })
      .catch(() => {
        if (!cancelled) setPicks({ key, items: [], error: "Could not reach the server." });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDetail?.town, flatType]);

  const palette = ramp(false);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="muted text-xs">Price layer for:</span>
          {MAP_FLAT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFlatType(t)}
              aria-pressed={t === flatType}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                t === flatType
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-[var(--border)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {titleCase(t)}
            </button>
          ))}
        </div>

        <div className="relative h-[30rem] overflow-hidden rounded-xl border border-[var(--border)] sm:h-[42rem] lg:h-[48rem]">
          {loading ? (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <p className="text-sm font-medium">Scoring every neighbourhood…</p>
                <p className="muted mt-1 text-xs">
                  This runs once, then re-weights instantly.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <p className="text-sm font-medium">{error}</p>
                <p className="muted mt-1 text-xs">
                  The map needs seeded amenity data — run{" "}
                  <code className="rounded bg-[var(--surface-2)] px-1">npm run seed</code>.
                </p>
              </div>
            </div>
          ) : scored.cells.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <p className="text-sm font-medium">Nothing to map yet</p>
                <p className="muted mt-1 max-w-sm text-xs">
                  {grid?.notes[0] ??
                    "No amenity datasets are seeded, so no area can be scored."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <FitMap
                cells={scored.cells}
                thresholds={scored.thresholds}
                cellSizeM={grid!.cellSizeM}
                onHover={setHover}
                onSelect={setSelected}
              />
              {hover && (
                <div
                  data-testid="map-tooltip"
                  className="pointer-events-none absolute z-[500] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-lg"
                  style={{
                    left: Math.min(hover.x + 12, 9999),
                    top: hover.y + 12,
                    transform: hover.x > 500 ? "translateX(calc(-100% - 24px))" : undefined,
                  }}
                >
                  <div className="font-medium">
                    {hover.cell.townIndex === NO_DATA
                      ? "Singapore"
                      : titleCase(grid!.towns[hover.cell.townIndex] ?? "")}
                  </div>
                  <div className="muted">Fit {Math.round(hover.cell.fit)} / 100</div>
                </div>
              )}
            </>
          )}
        </div>

        <Legend palette={palette} />

        {grid && grid.notes.length > 0 && (
          <ul className="muted space-y-1 text-xs">
            {grid.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}

        {grid && grid.missing.length > 0 && (
          <p className="muted text-xs">
            Not seeded, so left out of every area&rsquo;s score:{" "}
            {grid.missing.map((c) => CATEGORY_LABELS[c]).join(", ")}.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {selectedDetail ? (
          <section className="card">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">
                {selectedDetail.town ? titleCase(selectedDetail.town) : "Selected area"}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="muted ml-auto text-xs underline underline-offset-2"
              >
                Clear
              </button>
            </div>
            <p className="muted mt-0.5 text-xs">
              Fit {selectedDetail.fit} / 100
              {selectedDetail.median != null &&
                ` · ${titleCase(flatType)} median ${money(selectedDetail.median)}`}
            </p>
            <ul className="mt-3 space-y-2">
              {selectedDetail.pillars.map((p) => (
                <li key={p.id} className="grid grid-cols-[8.5rem_1fr] items-center gap-2">
                  <span
                    className={`truncate text-xs ${weights[p.id as PillarId] === 0 ? "muted line-through" : ""}`}
                  >
                    {PILLARS.find((m) => m.id === p.id)?.label}
                  </span>
                  <ScoreBar score={p.score} />
                </li>
              ))}
            </ul>
            <PicksList
              town={selectedDetail.town}
              flatType={flatType}
              loading={picksLoading}
              items={picksItems}
              error={picksError}
            />
          </section>
        ) : (
          townRanking.length > 0 && (
            <section className="card">
              <h2 className="text-sm font-semibold">Best towns for you</h2>
              <p className="muted mt-0.5 text-xs">
                Average across every scored neighbourhood in the town.
              </p>
              <ol className="mt-3 space-y-2">
                {townRanking.slice(0, 10).map((t, i) => (
                  <li key={t.town} className="grid grid-cols-[1.25rem_7.5rem_1fr] items-center gap-2">
                    <span className="muted text-xs tabular-nums">{i + 1}</span>
                    <span className="truncate text-xs" title={titleCase(t.town)}>
                      {titleCase(t.town)}
                    </span>
                    <ScoreBar score={t.fit} />
                  </li>
                ))}
              </ol>
              {townRanking.length > 10 && (
                <details className="mt-2">
                  <summary className="muted cursor-pointer text-xs">
                    Show the rest
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {townRanking.slice(10).map((t, i) => (
                      <li
                        key={t.town}
                        className="grid grid-cols-[1.25rem_7.5rem_1fr] items-center gap-2"
                      >
                        <span className="muted text-xs tabular-nums">{i + 11}</span>
                        <span className="truncate text-xs">{titleCase(t.town)}</span>
                        <ScoreBar score={t.fit} />
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          )
        )}

        {ready && <WeightsPanel weights={weights} onChange={setWeights} onReset={reset} />}
      </div>
    </div>
  );
}

function PicksList({
  town,
  flatType,
  loading,
  items,
  error,
}: {
  town: string | null;
  flatType: string;
  loading: boolean;
  items: MapPick[];
  error: string | null;
}) {
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <h3 className="text-xs font-semibold">
        Recently sold {titleCase(flatType)} flats here
      </h3>
      {!town ? (
        <p className="muted mt-2 text-xs">
          This spot isn&rsquo;t attributed to a town, so there is no price data to pick from.
        </p>
      ) : loading ? (
        <p className="muted mt-2 text-xs">Looking up recent sales…</p>
      ) : error ? (
        <p className="muted mt-2 text-xs">{error}</p>
      ) : items.length === 0 ? (
        <p className="muted mt-2 text-xs">
          No recent {titleCase(flatType)} sales recorded for {titleCase(town)}.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((p) => (
            <li key={`${p.block}-${p.street}`}>
              <Link
                href={pickHref(p)}
                className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 text-xs transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {titleCase(p.address)}
                </span>
                <span className="muted shrink-0 tabular-nums">
                  {money(p.price)} · {monthLabel(p.month)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Legend({ palette }: { palette: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-medium">How well it fits you</span>
      <div className="flex items-center gap-1.5">
        <span className="muted text-xs">worse</span>
        <div className="flex overflow-hidden rounded" role="img" aria-label="Colour scale from worse fit to better fit">
          {palette.map((c, i) => (
            <span
              key={c}
              className="h-3 w-8"
              style={{ background: c }}
              title={BANDS[i]?.label}
            />
          ))}
        </div>
        <span className="muted text-xs">better</span>
      </div>
      <span className="muted text-xs">
        Shaded by percentile against the rest of Singapore, so the best areas
        <em> for your weighting</em> always stand out.
      </span>
    </div>
  );
}

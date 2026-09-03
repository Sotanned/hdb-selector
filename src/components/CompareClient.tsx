"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useShortlist, useWeights, type ShortlistEntry } from "@/lib/store";
import { fitScore } from "@/lib/scoring";
import { PILLARS, type PillarScore } from "@/lib/types";
import { money, titleCase } from "@/lib/format";
import { ScoreBar, ScoreDial } from "./Score";
import type { PropertyReport } from "@/lib/report";

type Loaded = { entry: ShortlistEntry; report: PropertyReport | null; error?: string };

function reportUrl(e: ShortlistEntry): string {
  const p = new URLSearchParams({ lat: String(e.lat), lng: String(e.lng), address: e.address });
  if (e.block) p.set("block", e.block);
  if (e.street) p.set("street", e.street);
  if (e.postal) p.set("postal", e.postal);
  return `/api/report?${p.toString()}`;
}

export function CompareClient() {
  const { items, remove, ready } = useShortlist();
  const { weights } = useWeights();
  // Keyed by the shortlist it belongs to, so a removed entry's report is
  // discarded by derivation rather than by clearing state in an effect.
  const shortlistKey = items.map((e) => e.id).join("|");
  const [fetched, setFetched] = useState<{ key: string; reports: Loaded[] }>({
    key: "",
    reports: [],
  });

  const loaded = fetched.key === shortlistKey ? fetched.reports : [];
  const loading = ready && items.length > 0 && loaded.length < items.length;

  useEffect(() => {
    if (!ready || items.length === 0) return;
    let cancelled = false;

    // Sequential rather than parallel: each report fans out to several
    // government APIs, and hammering them from one browser is a good way to get
    // rate limited halfway through the comparison.
    (async () => {
      const out: Loaded[] = [];
      for (const entry of items) {
        try {
          const res = await fetch(reportUrl(entry));
          const body = await res.json();
          out.push(
            res.ok
              ? { entry, report: body as PropertyReport }
              : { entry, report: null, error: body.error ?? "Could not load" },
          );
        } catch {
          out.push({ entry, report: null, error: "Could not load" });
        }
        if (cancelled) return;
        setFetched({ key: shortlistKey, reports: [...out] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, ready, shortlistKey]);

  if (!ready) return null;

  if (items.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm">Nothing shortlisted yet.</p>
        <p className="muted mt-1 text-sm">
          Open a block&rsquo;s report and press <strong>Add to shortlist</strong> to start
          comparing.
        </p>
        <Link href="/" className="btn btn-primary mt-4">
          Search for a block
        </Link>
      </div>
    );
  }

  const withFit = loaded.map((l) => ({
    ...l,
    fit: l.report ? fitScore(l.report.pillars, weights) : null,
  }));
  const best = Math.max(...withFit.map((w) => w.fit?.overall ?? -1));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {withFit.map(({ entry, report, fit, error }) => (
          <div
            key={entry.id}
            className="card"
            style={
              fit?.overall != null && fit.overall === best && withFit.length > 1
                ? { borderColor: "var(--good)" }
                : undefined
            }
          >
            <div className="flex items-start gap-3">
              <ScoreDial score={fit?.overall ?? null} size={64} label="Fit" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold" title={entry.address}>
                  {titleCase(entry.address)}
                </h2>
                <p className="muted mt-0.5 text-xs">
                  {report?.town ? titleCase(report.town) : error ? error : "Loading…"}
                </p>
                {report?.prices.block?.median != null && (
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {money(report.prices.block.median)}
                    <span className="muted ml-1 text-xs font-normal">
                      median {titleCase(report.prices.flatType ?? "")}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {report && (
              <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                {PILLARS.map((meta) => {
                  const pillar = report.pillars.find(
                    (p: PillarScore) => p.pillar === meta.id,
                  );
                  return (
                    <li key={meta.id} className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <span
                        className={`truncate text-xs ${weights[meta.id] === 0 ? "muted line-through" : ""}`}
                      >
                        {meta.label}
                      </span>
                      <ScoreBar score={pillar?.score ?? null} />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <Link
                href={`/property?lat=${entry.lat}&lng=${entry.lng}&address=${encodeURIComponent(entry.address)}${entry.block ? `&block=${encodeURIComponent(entry.block)}` : ""}${entry.street ? `&street=${encodeURIComponent(entry.street)}` : ""}`}
                className="btn flex-1"
              >
                Full report
              </Link>
              <button type="button" className="btn" onClick={() => remove(entry.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <p className="muted text-center text-sm">
          Loading {loaded.length + 1} of {items.length}…
        </p>
      )}
    </>
  );
}

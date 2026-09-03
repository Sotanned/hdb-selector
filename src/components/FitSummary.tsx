"use client";

import { fitScore } from "@/lib/scoring";
import { PILLARS, type PillarScore } from "@/lib/types";
import { useWeights } from "@/lib/store";
import { ScoreBar, ScoreDial } from "./Score";
import Link from "next/link";

/**
 * The headline number. Computed in the browser rather than on the server
 * because the weights that produce it are the user's own and never leave
 * their machine.
 */
export function FitSummary({ pillars }: { pillars: PillarScore[] }) {
  const { weights, ready } = useWeights();
  const byId = new Map(pillars.map((p) => [p.pillar, p]));
  const fit = fitScore(pillars, weights);

  const ranked = PILLARS.map((meta) => ({ meta, pillar: byId.get(meta.id) })).filter(
    (r) => r.pillar,
  );

  const strongest = ranked
    .filter((r) => weights[r.meta.id] > 0 && r.pillar!.score != null)
    .sort((a, b) => b.pillar!.score! - a.pillar!.score!);

  return (
    <section className="card">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <ScoreDial score={ready ? fit.overall : null} size={104} label="Fit score" />
          <div>
            <h2 className="text-sm font-semibold">Fit for your priorities</h2>
            <p className="muted mt-0.5 max-w-xs text-sm leading-relaxed">
              {fit.overall == null
                ? "Nothing could be scored yet — check the data sources below."
                : strongest.length > 0
                  ? `Strongest on ${strongest[0].meta.label.toLowerCase()}; weakest on ${strongest[strongest.length - 1].meta.label.toLowerCase()}.`
                  : "Adjust your priorities to see a weighted score."}
            </p>
            {fit.missing.length > 0 && (
              <p className="muted mt-1.5 text-xs">
                {fit.missing.length} weighted pillar{fit.missing.length > 1 ? "s have" : " has"} no
                data, so {fit.missing.length > 1 ? "they are" : "it is"} left out of this number.
              </p>
            )}
            <Link
              href="/"
              className="mt-2 inline-block text-xs font-medium text-accent-600 underline underline-offset-2"
            >
              Change what matters to you
            </Link>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-2 sm:border-l sm:border-[var(--border)] sm:pl-6">
          {ranked.map(({ meta, pillar }) => {
            const weight = weights[meta.id];
            return (
              <li key={meta.id} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                <span
                  className={`truncate text-xs ${weight === 0 ? "muted line-through" : "font-medium"}`}
                  title={weight === 0 ? `${meta.label} — ignored in your score` : meta.label}
                >
                  {meta.label}
                </span>
                <ScoreBar score={pillar!.score} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

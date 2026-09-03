"use client";

import { PILLARS, type PillarId, type Weights } from "@/lib/types";

const LEVELS = ["Ignore", "Minor", "Some", "Matters", "Important", "Critical"];

/**
 * The weights are the whole point of the app: two households looking at the
 * same block should get different answers. Kept to a 0–5 scale because finer
 * granularity is false precision on a subjective judgement.
 */
export function WeightsPanel({
  weights,
  onChange,
  onReset,
}: {
  weights: Weights;
  onChange: (next: Weights) => void;
  onReset: () => void;
}) {
  const set = (id: PillarId, value: number) => onChange({ ...weights, [id]: value });

  return (
    <section className="card">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">What matters to you</h2>
        <button
          type="button"
          onClick={onReset}
          className="muted ml-auto text-xs underline underline-offset-2 hover:text-[var(--text)]"
        >
          Reset
        </button>
      </div>
      <p className="muted mb-4 text-xs">
        Every score below is re-weighted by these. Saved in this browser only.
      </p>

      <div className="space-y-4">
        {PILLARS.map((p) => (
          <div key={p.id}>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`w-${p.id}`} className="text-sm font-medium">
                {p.label}
              </label>
              <span className="muted text-xs tabular-nums">{LEVELS[weights[p.id]] ?? weights[p.id]}</span>
            </div>
            <input
              id={`w-${p.id}`}
              type="range"
              min={0}
              max={5}
              step={1}
              value={weights[p.id]}
              onChange={(e) => set(p.id, Number(e.target.value))}
              className="mt-1.5 w-full"
              aria-describedby={`w-${p.id}-desc`}
            />
            <p id={`w-${p.id}-desc`} className="muted mt-0.5 text-xs">
              {p.blurb}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

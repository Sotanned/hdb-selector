import type { PillarScore } from "@/lib/types";

export type Verdict = "good" | "ok" | "poor" | "unknown";

export function verdictColor(v: Verdict): string {
  return { good: "var(--good)", ok: "var(--ok)", poor: "var(--poor)", unknown: "var(--unknown)" }[v];
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: "Good",
  ok: "Fair",
  poor: "Weak",
  unknown: "No data",
};

export function scoreVerdict(score: number | null): Verdict {
  if (score == null) return "unknown";
  if (score >= 70) return "good";
  if (score >= 45) return "ok";
  return "poor";
}

/** Circular score dial. `size` is the outer diameter in pixels. */
export function ScoreDial({
  score,
  size = 112,
  label,
}: {
  score: number | null;
  size?: number;
  label?: string;
}) {
  const stroke = Math.max(6, Math.round(size * 0.085));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = score == null ? 0 : (score / 100) * circumference;
  const color = verdictColor(scoreVerdict(score));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          score == null ? `${label ?? "Score"}: not available` : `${label ?? "Score"}: ${score} out of 100`
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="font-semibold tabular-nums"
          style={{ fontSize: size * 0.28, color: score == null ? "var(--text-muted)" : color }}
        >
          {score ?? "–"}
        </span>
      </div>
    </div>
  );
}

/**
 * Verdict glyph. Shape carries the verdict as well as colour — a filled disc,
 * a hollow ring, a bar and a dash — so the four states stay distinguishable
 * under colour-vision deficiency, in print, and in forced-colours mode.
 */
export function VerdictDot({ verdict }: { verdict: Verdict }) {
  const color = verdictColor(verdict);
  const glyph = {
    good: <circle cx="5" cy="5" r="4" fill={color} />,
    ok: <circle cx="5" cy="5" r="3.4" fill="none" stroke={color} strokeWidth="1.8" />,
    poor: <rect x="1" y="3.6" width="8" height="2.8" rx="1.4" fill={color} />,
    unknown: <rect x="1.5" y="4.4" width="7" height="1.2" rx="0.6" fill={color} />,
  }[verdict];

  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="mt-[3px] shrink-0" role="img">
      <title>{VERDICT_LABEL[verdict]}</title>
      {glyph}
    </svg>
  );
}

/** Horizontal 0–100 bar, used in the pillar list and the comparison table. */
export function ScoreBar({ score }: { score: number | null }) {
  const color = verdictColor(scoreVerdict(score));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${score ?? 0}%`, background: color }}
        />
      </div>
      <span
        className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums"
        style={{ color: score == null ? "var(--text-muted)" : color }}
      >
        {score ?? "–"}
      </span>
    </div>
  );
}

export function PillarFactors({ pillar }: { pillar: PillarScore }) {
  return (
    <ul className="space-y-1.5">
      {pillar.factors.map((f) => (
        <li key={f.label} className="flex items-baseline gap-2 text-sm">
          <VerdictDot verdict={f.verdict} />
          <span className="muted">{f.label}</span>
          <span className="ml-auto text-right font-medium">{f.value}</span>
        </li>
      ))}
    </ul>
  );
}

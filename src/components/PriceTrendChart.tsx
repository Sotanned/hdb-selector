"use client";

import { useMemo, useRef, useState } from "react";
import { money, moneyShort, monthLabel } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/types";

const PAD = { top: 16, right: 16, bottom: 26, left: 52 };

/**
 * Median resale price by month for one town and flat type.
 *
 * A single series, so no legend — the caption names it. Transaction counts are
 * a second measure on a different scale, so they live in the tooltip and the
 * table rather than on a second y-axis.
 */
export function PriceTrendChart({
  points,
  caption,
  height = 220,
}: {
  points: MonthlyPoint[];
  caption: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 720; // viewBox units; the SVG scales to its container.
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.median);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Pad the domain by 8% so the line never grazes the frame, and keep a floor
    // of zero-free scaling: price differences of $20k matter and would vanish
    // against a zero baseline.
    const span = Math.max(rawMax - rawMin, rawMax * 0.05);
    const min = rawMin - span * 0.25;
    const max = rawMax + span * 0.25;

    const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.median).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z`;

    const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];

    return { x, y, line, area, ticks, min, max };
  }, [points, plotW, plotH]);

  if (!model) {
    return (
      <p className="muted py-8 text-center text-sm">
        Not enough monthly sales to plot a trend.
      </p>
    );
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const ratio = (px - PAD.left) / plotW;
    const idx = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const active = hover != null ? points[hover] : null;
  const first = points[0];
  const last = points[points.length - 1];
  const change = first.median ? (last.median - first.median) / first.median : 0;

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{caption}</span>
        <span className="muted text-xs">
          {monthLabel(first.month)} – {monthLabel(last.month)} · {change >= 0 ? "+" : ""}
          {(change * 100).toFixed(1)}% over the window
        </span>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="muted ml-auto text-xs underline underline-offset-2 hover:text-[var(--text)]"
        >
          {showTable ? "Hide table" : "View as table"}
        </button>
      </figcaption>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none"
          style={{ height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${caption}. Median moved from ${money(first.median)} in ${monthLabel(first.month)} to ${money(last.median)} in ${monthLabel(last.month)}.`}
        >
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--series)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines and y labels. */}
          {model.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={model.y(t)}
                y2={model.y(t)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={model.y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontSize="11"
              >
                {moneyShort(t)}
              </text>
            </g>
          ))}

          <path d={model.area} fill="url(#priceFill)" />
          <path
            d={model.line}
            fill="none"
            stroke="var(--series)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* x labels: first, middle and last only, to avoid collisions. */}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
            <text
              key={i}
              x={model.x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fill="var(--text-muted)"
              fontSize="11"
            >
              {monthLabel(points[i].month)}
            </text>
          ))}

          {hover != null && (
            <g>
              <line
                x1={model.x(hover)}
                x2={model.x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--text-muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={model.x(hover)}
                cy={model.y(points[hover].median)}
                r="5"
                fill="var(--series)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: `${(model.x(hover!) / width) * 100}%`,
              transform:
                hover! > points.length / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="font-medium">{monthLabel(active.month)}</div>
            <div className="tabular-nums">{money(active.median)} median</div>
            <div className="muted">
              {active.count} sale{active.count === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>

      {showTable && (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-1.5 font-medium">Month</th>
                <th className="px-3 py-1.5 text-right font-medium">Median</th>
                <th className="px-3 py-1.5 text-right font-medium">Sales</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.month} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5">{monthLabel(p.month)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(p.median)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

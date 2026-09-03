/**
 * Sequential ramp for the fit map: one hue, monotone lightness, taken verbatim
 * from the documented blue scale. The anchor flips between modes so that the
 * low end always recedes toward the surface — on a map that means "not for you"
 * lets the basemap show through, and the areas worth looking at are the solid ones.
 */
const RAMP_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#104281"];
const RAMP_DARK = ["#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

export function ramp(dark: boolean): string[] {
  return dark ? RAMP_DARK : RAMP_LIGHT;
}

/**
 * Percentile break points, worst to best. Shading is relative to the rest of
 * Singapore rather than absolute, because a weighted fit score has no natural
 * zero and absolute bands would paint the whole island one colour for anyone
 * with even weights. The legend says so, and the tooltip gives the raw score.
 */
export const BANDS = [
  { from: 0.0, to: 0.4, label: "Bottom 40%" },
  { from: 0.4, to: 0.6, label: "40–60%" },
  { from: 0.6, to: 0.75, label: "60–75%" },
  { from: 0.75, to: 0.87, label: "75–87%" },
  { from: 0.87, to: 0.95, label: "87–95%" },
  { from: 0.95, to: 1.0, label: "Top 5%" },
] as const;

/** Thresholds that split `values` at each band boundary. */
export function bandThresholds(values: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return BANDS.slice(1).map((b) => at(b.from));
}

/** Index into the ramp for one value, given the thresholds from `bandThresholds`. */
export function bandOf(value: number, thresholds: number[]): number {
  let i = 0;
  while (i < thresholds.length && value >= thresholds[i]) i++;
  return i;
}

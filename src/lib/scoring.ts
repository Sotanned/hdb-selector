import type { PillarId, PillarScore, Weights } from "./types";

export type Verdict = "good" | "ok" | "poor" | "unknown";

/**
 * Map a value onto 0–100 through explicit break points. Every threshold in this
 * file is a judgement call about Singapore housing, not a fact — they are
 * gathered here so they can be argued with and changed in one place.
 *
 * `points` must be sorted by `at` ascending. Values between points interpolate.
 */
function curve(value: number, points: ReadonlyArray<{ at: number; score: number }>): number {
  if (value <= points[0].at) return points[0].score;
  const last = points[points.length - 1];
  if (value >= last.at) return last.score;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (value <= b.at) {
      const t = (value - a.at) / (b.at - a.at);
      return a.score + t * (b.score - a.score);
    }
  }
  return last.score;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function verdictFor(score: number): Verdict {
  if (score >= 70) return "good";
  if (score >= 45) return "ok";
  return "poor";
}

type Factor = PillarScore["factors"][number];

/** Combine sub-scores, ignoring the ones we have no data for. */
function combine(parts: Array<{ score: number | null; weight: number }>): number | null {
  const known = parts.filter((p) => p.score !== null) as Array<{ score: number; weight: number }>;
  if (known.length === 0) return null;
  const totalWeight = known.reduce((s, p) => s + p.weight, 0);
  return clamp(known.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight);
}

/* ------------------------------ Financial ------------------------------ */

export type FinancialInput = {
  /** Median resale price for this block, recent window. */
  blockMedian: number | null;
  /** Median for the same flat type across the town. */
  townMedian: number | null;
  remainingLeaseYears: number | null;
  /** Year-on-year change in the town's median, as a fraction. */
  townYoy: number | null;
};

export function scoreFinancial(input: FinancialInput): PillarScore {
  const factors: Factor[] = [];

  let valueScore: number | null = null;
  if (input.blockMedian && input.townMedian) {
    const ratio = input.blockMedian / input.townMedian;
    // Cheaper than the town median scores well; a big premium scores poorly.
    valueScore = clamp(
      curve(ratio, [
        { at: 0.8, score: 100 },
        { at: 0.95, score: 78 },
        { at: 1.0, score: 62 },
        { at: 1.1, score: 40 },
        { at: 1.25, score: 15 },
      ]),
    );
    const pct = (ratio - 1) * 100;
    factors.push({
      label: "Price vs town median",
      value: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`,
      verdict: verdictFor(valueScore),
    });
  } else {
    factors.push({ label: "Price vs town median", value: "No recent sales", verdict: "unknown" });
  }

  let leaseScore: number | null = null;
  if (input.remainingLeaseYears != null) {
    // Below ~60 years the flat stops covering a young buyer to 95, CPF usage is
    // restricted, and the resale pool narrows sharply.
    leaseScore = clamp(
      curve(input.remainingLeaseYears, [
        { at: 40, score: 5 },
        { at: 55, score: 30 },
        { at: 65, score: 60 },
        { at: 80, score: 88 },
        { at: 95, score: 100 },
      ]),
    );
    factors.push({
      label: "Lease remaining",
      value: `${input.remainingLeaseYears} years`,
      verdict: verdictFor(leaseScore),
    });
  } else {
    factors.push({ label: "Lease remaining", value: "Unknown", verdict: "unknown" });
  }

  if (input.townYoy != null) {
    const pct = input.townYoy * 100;
    factors.push({
      label: "Town price trend (YoY)",
      value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      verdict: "unknown",
    });
  }

  const score = combine([
    { score: valueScore, weight: 1 },
    { score: leaseScore, weight: 1.4 },
  ]);

  return {
    pillar: "financial",
    score,
    summary:
      score == null
        ? "Not enough transaction history to judge value here."
        : input.remainingLeaseYears != null && input.remainingLeaseYears < 60
          ? "Short remaining lease — check CPF usage limits and your exit plan."
          : score >= 70
            ? "Priced at or below the town median with a healthy lease."
            : "Priced above what comparable flats in this town fetch.",
    factors,
  };
}

/* ---------------------------- Accessibility ---------------------------- */

export type AccessibilityInput = {
  nearestMrtWalkMin: number | null;
  nearestMrtName: string | null;
  busStopsWithin400m: number | null;
  cbdDistanceKm: number;
};

export function scoreAccessibility(input: AccessibilityInput): PillarScore {
  const factors: Factor[] = [];

  let mrtScore: number | null = null;
  if (input.nearestMrtWalkMin != null) {
    mrtScore = clamp(
      curve(input.nearestMrtWalkMin, [
        { at: 3, score: 100 },
        { at: 6, score: 88 },
        { at: 10, score: 66 },
        { at: 15, score: 40 },
        { at: 25, score: 10 },
      ]),
    );
    factors.push({
      label: "Nearest MRT / LRT",
      value: `${input.nearestMrtName ?? "Station"} — ${input.nearestMrtWalkMin} min walk`,
      verdict: verdictFor(mrtScore),
    });
  } else {
    factors.push({ label: "Nearest MRT / LRT", value: "Not available", verdict: "unknown" });
  }

  let busScore: number | null = null;
  if (input.busStopsWithin400m != null) {
    busScore = clamp(
      curve(input.busStopsWithin400m, [
        { at: 0, score: 0 },
        { at: 1, score: 45 },
        { at: 3, score: 75 },
        { at: 6, score: 95 },
        { at: 10, score: 100 },
      ]),
    );
    factors.push({
      label: "Bus stops within 400 m",
      value: String(input.busStopsWithin400m),
      verdict: verdictFor(busScore),
    });
  } else {
    factors.push({ label: "Bus stops within 400 m", value: "Not available", verdict: "unknown" });
  }

  const cbdScore = clamp(
    curve(input.cbdDistanceKm, [
      { at: 3, score: 100 },
      { at: 8, score: 78 },
      { at: 13, score: 55 },
      { at: 18, score: 32 },
      { at: 25, score: 12 },
    ]),
  );
  factors.push({
    label: "Straight-line distance to Raffles Place",
    value: `${input.cbdDistanceKm.toFixed(1)} km`,
    verdict: verdictFor(cbdScore),
  });

  const score = combine([
    { score: mrtScore, weight: 2 },
    { score: busScore, weight: 1 },
    { score: cbdScore, weight: 1 },
  ]);

  return {
    pillar: "accessibility",
    score,
    summary:
      input.nearestMrtWalkMin != null && input.nearestMrtWalkMin <= 8
        ? "Comfortably within walking distance of a station."
        : input.nearestMrtWalkMin != null && input.nearestMrtWalkMin <= 15
          ? "A long-ish walk to the MRT — you will lean on buses."
          : "Getting around depends mostly on buses or driving.",
    factors,
  };
}

/* ------------------------------ Education ------------------------------ */

export type EducationInput = {
  primaryWithin1km: number | null;
  primaryWithin2km: number | null;
  secondaryWithin2km: number | null;
  preschoolsWithin500m: number | null;
};

export function scoreEducation(input: EducationInput): PillarScore {
  const factors: Factor[] = [];

  let p1Score: number | null = null;
  if (input.primaryWithin1km != null) {
    // The 1 km band carries the highest priority in P1 registration, so having
    // any school inside it matters far more than having several.
    p1Score = clamp(
      curve(input.primaryWithin1km, [
        { at: 0, score: 20 },
        { at: 1, score: 75 },
        { at: 2, score: 90 },
        { at: 4, score: 100 },
      ]),
    );
    factors.push({
      label: "Primary schools within 1 km",
      value: String(input.primaryWithin1km),
      verdict: verdictFor(p1Score),
    });
  } else {
    factors.push({ label: "Primary schools within 1 km", value: "Not available", verdict: "unknown" });
  }

  if (input.primaryWithin2km != null) {
    factors.push({
      label: "Primary schools within 2 km",
      value: String(input.primaryWithin2km),
      verdict: input.primaryWithin2km > 0 ? "good" : "poor",
    });
  }
  if (input.secondaryWithin2km != null) {
    factors.push({
      label: "Secondary schools within 2 km",
      value: String(input.secondaryWithin2km),
      verdict: input.secondaryWithin2km >= 2 ? "good" : input.secondaryWithin2km >= 1 ? "ok" : "poor",
    });
  }
  if (input.preschoolsWithin500m != null) {
    factors.push({
      label: "Preschools within 500 m",
      value: String(input.preschoolsWithin500m),
      verdict: input.preschoolsWithin500m >= 3 ? "good" : input.preschoolsWithin500m >= 1 ? "ok" : "poor",
    });
  }

  const secScore =
    input.secondaryWithin2km == null
      ? null
      : clamp(curve(input.secondaryWithin2km, [
          { at: 0, score: 30 },
          { at: 1, score: 65 },
          { at: 3, score: 90 },
          { at: 5, score: 100 },
        ]));
  const preScore =
    input.preschoolsWithin500m == null
      ? null
      : clamp(curve(input.preschoolsWithin500m, [
          { at: 0, score: 25 },
          { at: 2, score: 70 },
          { at: 5, score: 95 },
          { at: 8, score: 100 },
        ]));

  const score = combine([
    { score: p1Score, weight: 2.5 },
    { score: secScore, weight: 1 },
    { score: preScore, weight: 1 },
  ]);

  return {
    pillar: "education",
    score,
    summary:
      input.primaryWithin1km == null
        ? "School data has not been seeded."
        : input.primaryWithin1km > 0
          ? `${input.primaryWithin1km} primary school${input.primaryWithin1km > 1 ? "s" : ""} inside the 1 km priority band.`
          : "No primary school inside the 1 km band — P1 registration will be harder.",
    factors,
  };
}

/* ---------------------------- Daily living ----------------------------- */

export type CountInput = { label: string; count: number | null; good: number; ok: number };

function countFactors(inputs: CountInput[]): { factors: Factor[]; parts: Array<{ score: number | null; weight: number }> } {
  const factors: Factor[] = [];
  const parts: Array<{ score: number | null; weight: number }> = [];
  for (const i of inputs) {
    if (i.count == null) {
      factors.push({ label: i.label, value: "Not available", verdict: "unknown" });
      parts.push({ score: null, weight: 1 });
      continue;
    }
    const s = clamp(
      curve(i.count, [
        { at: 0, score: 15 },
        { at: i.ok, score: 60 },
        { at: i.good, score: 95 },
        { at: i.good * 2, score: 100 },
      ]),
    );
    factors.push({ label: i.label, value: String(i.count), verdict: verdictFor(s) });
    parts.push({ score: s, weight: 1 });
  }
  return { factors, parts };
}

export type DailyLivingInput = {
  hawkerWithin800m: number | null;
  supermarketWithin800m: number | null;
  clinicWithin1km: number | null;
  mallWithin1km: number | null;
};

export function scoreDailyLiving(input: DailyLivingInput): PillarScore {
  const { factors, parts } = countFactors([
    { label: "Hawker centres within 800 m", count: input.hawkerWithin800m, ok: 1, good: 2 },
    { label: "Supermarkets within 800 m", count: input.supermarketWithin800m, ok: 1, good: 3 },
    { label: "Clinics within 1 km", count: input.clinicWithin1km, ok: 2, good: 6 },
    { label: "Malls within 1 km", count: input.mallWithin1km, ok: 1, good: 2 },
  ]);
  const score = combine(parts);
  return {
    pillar: "dailyLiving",
    score,
    summary:
      score == null
        ? "Amenity datasets have not been seeded."
        : score >= 70
          ? "Everyday errands are all within a short walk."
          : "You will drive or take a bus for most errands.",
    factors,
  };
}

/* ---------------------------- Recreation ------------------------------- */

export type RecreationInput = {
  sportsWithin1km: number | null;
  parksWithin1km: number | null;
  nearestSportsName: string | null;
  nearestSportsWalkMin: number | null;
};

export function scoreRecreation(input: RecreationInput): PillarScore {
  const { factors, parts } = countFactors([
    { label: "Sports facilities within 1 km", count: input.sportsWithin1km, ok: 1, good: 3 },
    { label: "Parks within 1 km", count: input.parksWithin1km, ok: 1, good: 4 },
  ]);
  if (input.nearestSportsName && input.nearestSportsWalkMin != null) {
    factors.push({
      label: "Closest sports facility",
      value: `${input.nearestSportsName} — ${input.nearestSportsWalkMin} min walk`,
      verdict: input.nearestSportsWalkMin <= 12 ? "good" : "ok",
    });
  }
  const score = combine(parts);
  return {
    pillar: "recreation",
    score,
    summary:
      score == null
        ? "Sports and park datasets have not been seeded."
        : score >= 70
          ? "Plenty of places to train or walk the dog nearby."
          : "Limited sport and green space within walking distance.",
    factors,
  };
}

/* ---------------------------- Environment ------------------------------ */

export type EnvironmentInput = {
  psi24h: number | null;
  psiRegion: string | null;
  dengueClustersWithin500m: number | null;
  forecast: string | null;
};

export function scoreEnvironment(input: EnvironmentInput): PillarScore {
  const factors: Factor[] = [];

  let psiScore: number | null = null;
  if (input.psi24h != null) {
    psiScore = clamp(
      curve(input.psi24h, [
        { at: 25, score: 100 },
        { at: 50, score: 85 },
        { at: 100, score: 50 },
        { at: 200, score: 10 },
      ]),
    );
    factors.push({
      label: `PSI (${input.psiRegion ?? "region"}, 24h)`,
      value: String(Math.round(input.psi24h)),
      verdict: verdictFor(psiScore),
    });
  } else {
    factors.push({ label: "PSI (24h)", value: "Not available", verdict: "unknown" });
  }

  let dengueScore: number | null = null;
  if (input.dengueClustersWithin500m != null) {
    dengueScore = clamp(
      curve(input.dengueClustersWithin500m, [
        { at: 0, score: 100 },
        { at: 1, score: 55 },
        { at: 3, score: 25 },
        { at: 5, score: 10 },
      ]),
    );
    factors.push({
      label: "Active dengue clusters within 500 m",
      value: String(input.dengueClustersWithin500m),
      verdict: verdictFor(dengueScore),
    });
  }

  if (input.forecast) {
    factors.push({ label: "Weather right now", value: input.forecast, verdict: "unknown" });
  }

  const score = combine([
    // PSI is island-wide haze, largely the same everywhere, so it carries less
    // weight in a *comparison* between blocks than the local dengue signal.
    { score: psiScore, weight: 1 },
    { score: dengueScore, weight: 1.5 },
  ]);

  return {
    pillar: "environment",
    score,
    summary:
      score == null
        ? "Live environment readings are unavailable."
        : (input.dengueClustersWithin500m ?? 0) > 0
          ? "There is an active dengue cluster near this block right now."
          : "Air quality and local health signals look normal.",
    factors,
  };
}

/* ------------------------------ Fit score ------------------------------ */

export type FitScore = {
  /** 0–100 weighted blend of the pillars that could be scored. */
  overall: number | null;
  /** Pillars the user weighted above zero but which had no data. */
  missing: PillarId[];
  /** Share of the user's total weight that we actually had data for. */
  coverage: number;
};

export function fitScore(pillars: PillarScore[], weights: Weights): FitScore {
  let weighted = 0;
  let covered = 0;
  let requested = 0;
  const missing: PillarId[] = [];

  for (const p of pillars) {
    const w = weights[p.pillar] ?? 0;
    if (w <= 0) continue;
    requested += w;
    if (p.score == null) {
      missing.push(p.pillar);
      continue;
    }
    weighted += p.score * w;
    covered += w;
  }

  return {
    overall: covered > 0 ? Math.round(weighted / covered) : null,
    missing,
    coverage: requested > 0 ? covered / requested : 0,
  };
}

"use client";

import { useEffect, useState } from "react";

type Status = {
  datasets: Array<{ category: string; label: string; seeded: boolean; count: number }>;
  seededCount: number;
  totalCount: number;
};

/**
 * Amenity datasets are downloaded by `npm run seed`, not bundled. Until that
 * runs, several pillars have nothing to score — say so plainly rather than
 * letting the report imply "nothing nearby".
 */
export function SetupBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status || status.seededCount === status.totalCount) return null;

  const missing = status.datasets.filter((d) => !d.seeded);

  return (
    <div className="card border-[var(--ok)]/40 bg-[var(--ok)]/[0.06]">
      <h2 className="text-sm font-semibold">
        {status.seededCount} of {status.totalCount} local datasets are set up
      </h2>
      <p className="muted mt-1 text-sm">
        Run <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs">npm run seed</code>{" "}
        to download the rest. Until then these cards will read &ldquo;not available&rdquo; rather
        than showing a score:
      </p>
      <p className="mt-2 text-xs">{missing.map((d) => d.label).join(" · ")}</p>
    </div>
  );
}

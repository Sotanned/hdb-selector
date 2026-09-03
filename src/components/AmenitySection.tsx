import { distance, titleCase } from "@/lib/format";
import type { NearbyAmenity } from "@/lib/types";

/** One category of nearby places, or an honest note about why it is missing. */
export function AmenityList({
  title,
  items,
  status,
  emptyNote,
  limit = 6,
  showWalk = true,
}: {
  title: string;
  items: NearbyAmenity[];
  status: "ok" | "not-seeded";
  emptyNote?: string;
  limit?: number;
  showWalk?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <h3 className="text-sm font-medium">{title}</h3>

      {status === "not-seeded" ? (
        <p className="muted mt-2 text-xs">
          Not downloaded yet — run <code className="rounded bg-[var(--surface-2)] px-1">npm run seed</code>.
        </p>
      ) : items.length === 0 ? (
        <p className="muted mt-2 text-xs">{emptyNote ?? "Nothing within the search radius."}</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {items.slice(0, limit).map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate" title={a.name}>
                  {titleCase(a.name)}
                </span>
                <span className="muted shrink-0 tabular-nums text-xs">
                  {distance(a.distanceM)}
                  {showWalk && a.walkMin <= 30 ? ` · ${a.walkMin} min` : ""}
                </span>
              </li>
            ))}
          </ul>
          {items.length > limit && (
            <p className="muted mt-2 text-xs">+{items.length - limit} more within range</p>
          )}
        </>
      )}
    </div>
  );
}

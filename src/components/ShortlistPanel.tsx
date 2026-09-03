"use client";

import Link from "next/link";
import { useShortlist } from "@/lib/store";
import { titleCase } from "@/lib/format";

export function ShortlistPanel() {
  const { items, remove, ready } = useShortlist();
  if (!ready || items.length === 0) return null;

  return (
    <section className="card">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">Your shortlist</h2>
        <Link
          href="/compare"
          className="ml-auto text-xs font-medium text-accent-600 underline underline-offset-2"
        >
          Compare all {items.length}
        </Link>
      </div>
      <ul className="space-y-1.5">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-sm">
            <Link
              href={`/property?lat=${e.lat}&lng=${e.lng}&address=${encodeURIComponent(e.address)}${e.block ? `&block=${encodeURIComponent(e.block)}` : ""}${e.street ? `&street=${encodeURIComponent(e.street)}` : ""}`}
              className="truncate hover:underline"
            >
              {titleCase(e.address)}
            </Link>
            <button
              type="button"
              onClick={() => remove(e.id)}
              className="muted ml-auto shrink-0 text-xs hover:text-[var(--poor)]"
              aria-label={`Remove ${e.address} from shortlist`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

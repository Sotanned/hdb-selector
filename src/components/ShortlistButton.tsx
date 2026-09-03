"use client";

import { entryId, useShortlist } from "@/lib/store";

export function ShortlistButton(props: {
  address: string;
  block: string | null;
  street: string | null;
  postal: string | null;
  lat: number;
  lng: number;
}) {
  const { add, remove, has, ready } = useShortlist();
  const id = entryId(props);
  const saved = has(id);

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => (saved ? remove(id) : add(props))}
      className={`btn ${saved ? "" : "btn-primary"}`}
      aria-pressed={saved}
    >
      {saved ? "✓ On your shortlist" : "Add to shortlist"}
    </button>
  );
}

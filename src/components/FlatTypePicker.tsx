"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { titleCase } from "@/lib/format";

/**
 * Price figures are meaningless across flat types, so the report always fixes
 * one. Defaults to whichever type transacts most often at the block.
 */
export function FlatTypePicker({
  options,
  selected,
}: {
  options: string[];
  selected: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  if (options.length <= 1) return null;

  const choose = (type: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("flatType", type);
    router.push(`/property?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="muted mr-1 text-xs">Flat type:</span>
      {options.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => choose(type)}
          aria-pressed={type === selected}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            type === selected
              ? "border-accent-600 bg-accent-600 text-white"
              : "border-[var(--border)] hover:bg-[var(--surface-2)]"
          }`}
        >
          {titleCase(type)}
        </button>
      ))}
    </div>
  );
}

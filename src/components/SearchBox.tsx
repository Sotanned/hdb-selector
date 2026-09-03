"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddressResult } from "@/lib/onemap";
import { titleCase } from "@/lib/format";

export function reportHref(r: AddressResult): string {
  const p = new URLSearchParams({
    lat: String(r.lat),
    lng: String(r.lng),
    address: r.address,
  });
  if (r.blockNo) p.set("block", r.blockNo);
  if (r.streetName) p.set("street", r.streetName);
  if (r.postal) p.set("postal", r.postal);
  return `/property?${p.toString()}`;
}

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce so a fast typist makes one request, not eight.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { results: AddressResult[]; error?: string };
        setResults(body.results ?? []);
        setError(body.error ?? null);
        setOpen(true);
        setCursor(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (r: AddressResult) => {
    setOpen(false);
    router.push(reportHref(r));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[Math.max(cursor, 0)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const hint = useMemo(() => {
    if (loading) return "Searching…";
    if (error) return error;
    if (term.trim().length >= 2 && results.length === 0 && !loading)
      return "No matching address.";
    return null;
  }, [loading, error, term, results.length]);

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="address-search" className="sr-only">
        Search for a block, street or postal code
      </label>
      <input
        id="address-search"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        className="field !py-3 !text-base"
        placeholder="Block, street or postal code — try 'Ang Mo Kio Ave 3' or '560123'"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="address-results"
      />

      {hint && <p className="muted mt-1.5 text-xs">{hint}</p>}

      {open && results.length > 0 && (
        <ul
          id="address-results"
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-80 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r)}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === cursor ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                <span className="block font-medium">
                  {r.building ? titleCase(r.building) : titleCase(r.address)}
                </span>
                <span className="muted block text-xs">{titleCase(r.address)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

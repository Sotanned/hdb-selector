"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WEIGHTS, type Weights } from "./types";

const WEIGHTS_KEY = "hdb-selector:weights:v1";
const SHORTLIST_KEY = "hdb-selector:shortlist:v1";

export type ShortlistEntry = {
  id: string;
  address: string;
  block: string | null;
  street: string | null;
  postal: string | null;
  lat: number;
  lng: number;
  addedAt: string;
};

export function entryId(e: { lat: number; lng: number }): string {
  return `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Preferences live only in this browser. Nothing about a household's income or
 * shortlist is sent anywhere — it never needs to be, so it isn't.
 */
export function useWeights() {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWeights(read(WEIGHTS_KEY, DEFAULT_WEIGHTS));
    setReady(true);
  }, []);

  const update = useCallback((next: Weights) => {
    setWeights(next);
    try {
      window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota — preferences just won't persist.
    }
  }, []);

  const reset = useCallback(() => update(DEFAULT_WEIGHTS), [update]);

  return { weights, setWeights: update, reset, ready };
}

export function useShortlist() {
  const [items, setItems] = useState<ShortlistEntry[]>([]);
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => setItems(readArray<ShortlistEntry>(SHORTLIST_KEY)), []);

  useEffect(() => {
    sync();
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHORTLIST_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [sync]);

  const persist = useCallback((next: ShortlistEntry[]) => {
    setItems(next);
    try {
      window.localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next));
    } catch {
      // Ignore: the shortlist is a convenience, not the source of truth.
    }
  }, []);

  const add = useCallback(
    (entry: Omit<ShortlistEntry, "id" | "addedAt">) => {
      const id = entryId(entry);
      const current = readArray<ShortlistEntry>(SHORTLIST_KEY);
      if (current.some((e) => e.id === id)) return;
      persist([...current, { ...entry, id, addedAt: new Date().toISOString() }]);
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => persist(readArray<ShortlistEntry>(SHORTLIST_KEY).filter((e) => e.id !== id)),
    [persist],
  );

  const has = useCallback((id: string) => items.some((e) => e.id === id), [items]);

  return { items, add, remove, has, ready };
}

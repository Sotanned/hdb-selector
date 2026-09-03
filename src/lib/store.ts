"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
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

/**
 * A `localStorage` key exposed as an external store.
 *
 * These values are genuinely external to React — another tab can change them,
 * and they do not exist during server rendering — so they belong in
 * `useSyncExternalStore` rather than in an effect that writes state on mount.
 * That gets hydration right by construction and gives cross-tab sync for free.
 *
 * Snapshots are the raw string, which is referentially stable, so React can
 * compare them cheaply; callers parse with a memo.
 */
function createLocalStore(key: string) {
  const listeners = new Set<() => void>();

  // Mirrors localStorage so getSnapshot never re-reads (and never returns a
  // fresh object), which is what useSyncExternalStore requires.
  let cache: string | null = null;
  let primed = false;

  const read = (): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Private browsing, or storage disabled entirely.
      return null;
    }
  };

  const notify = () => listeners.forEach((l) => l());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key) return;
        cache = read();
        notify();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },

    getSnapshot(): string | null {
      if (!primed) {
        cache = read();
        primed = true;
      }
      return cache;
    },

    /** Nothing is stored on the server, so hydration starts from the default. */
    getServerSnapshot(): string | null {
      return null;
    },

    write(value: unknown) {
      const raw = JSON.stringify(value);
      cache = raw;
      primed = true;
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Not persisting is harmless — the value is still live in this session.
      }
      notify();
    },
  };
}

const weightsStore = createLocalStore(WEIGHTS_KEY);
const shortlistStore = createLocalStore(SHORTLIST_KEY);

/**
 * True once the browser has taken over from the server-rendered markup.
 * Components use it to avoid flashing default state before the stored value
 * is available.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Preferences live only in this browser. Nothing about a household's income or
 * shortlist is sent anywhere — it never needs to be, so it isn't.
 */
export function useWeights() {
  const raw = useSyncExternalStore(
    weightsStore.subscribe,
    weightsStore.getSnapshot,
    weightsStore.getServerSnapshot,
  );

  const weights = useMemo<Weights>(() => {
    if (!raw) return DEFAULT_WEIGHTS;
    try {
      return { ...DEFAULT_WEIGHTS, ...(JSON.parse(raw) as Partial<Weights>) };
    } catch {
      return DEFAULT_WEIGHTS;
    }
  }, [raw]);

  const setWeights = useCallback((next: Weights) => weightsStore.write(next), []);
  const reset = useCallback(() => weightsStore.write(DEFAULT_WEIGHTS), []);

  return { weights, setWeights, reset, ready: useHydrated() };
}

export function useShortlist() {
  const raw = useSyncExternalStore(
    shortlistStore.subscribe,
    shortlistStore.getSnapshot,
    shortlistStore.getServerSnapshot,
  );

  const items = useMemo<ShortlistEntry[]>(() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ShortlistEntry[]) : [];
    } catch {
      return [];
    }
  }, [raw]);

  const add = useCallback(
    (entry: Omit<ShortlistEntry, "id" | "addedAt">) => {
      const id = entryId(entry);
      if (items.some((e) => e.id === id)) return;
      shortlistStore.write([...items, { ...entry, id, addedAt: new Date().toISOString() }]);
    },
    [items],
  );

  const remove = useCallback(
    (id: string) => shortlistStore.write(items.filter((e) => e.id !== id)),
    [items],
  );

  const has = useCallback((id: string) => items.some((e) => e.id === id), [items]);

  return { items, add, remove, has, ready: useHydrated() };
}

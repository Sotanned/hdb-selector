type Entry<T> = { value: T; expiresAt: number };

/**
 * Process-local TTL cache. Upstream government APIs are rate limited and the
 * resale dataset is only refreshed monthly, so nearly every request in a normal
 * session should be served from here rather than re-fetched.
 *
 * This is intentionally not a distributed cache: on serverless each instance
 * keeps its own copy, which is fine for read-only public data.
 */
const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/**
 * Cached fetch with request coalescing: concurrent callers asking for the same
 * key share one upstream round trip instead of stampeding it.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = producer()
    .then((value) => cacheSet(key, value, ttlMs))
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

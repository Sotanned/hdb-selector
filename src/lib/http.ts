export class UpstreamError extends Error {
  constructor(
    readonly source: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * `fetch` with a timeout, one retry on transient failure, and errors that name
 * the upstream so the UI can tell the user *which* source is down rather than
 * showing a blank card.
 */
export async function fetchJson<T>(
  url: string,
  opts: { source: string; timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {
    source: "upstream",
  },
): Promise<T> {
  const { source, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, headers } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", ...headers },
        // We do our own caching; don't let the platform layer double-cache.
        cache: "no-store",
      });
      if (!res.ok) {
        // 4xx is a bad request on our side — retrying will not help.
        if (res.status >= 400 && res.status < 500) {
          throw new UpstreamError(source, res.status, `${source} returned ${res.status}`);
        }
        throw new UpstreamError(source, res.status, `${source} returned ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof UpstreamError && err.status && err.status < 500) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof UpstreamError) throw lastError;
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new UpstreamError(source, null, `${source} unreachable: ${reason}`);
}

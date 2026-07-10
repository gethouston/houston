/**
 * Best-effort, in-process rate limiter for the tokenless Agent Store endpoints.
 *
 * ADVISORY only: a fixed-window counter in a module-level Map keyed by an
 * arbitrary string (typically `<route>:<ip>`). It lives in isolate memory, so on
 * Cloudflare Workers it protects a SINGLE isolate — NOT a durable, global limit.
 * Treat it as a cheap abuse speed-bump, not a security control. Durable limiting
 * is future infra. The Map is lazily swept so it cannot grow without bound.
 */

interface RateWindow {
  /** epoch ms when the current window ends */
  resetAt: number;
  /** requests counted in the current window */
  count: number;
}

// Reuse one map across dev HMR and warm-isolate reuse.
const globalForRateLimit = globalThis as unknown as {
  __agentStoreRateLimit?: Map<string, RateWindow>;
};

function initBuckets(): Map<string, RateWindow> {
  const existing = globalForRateLimit.__agentStoreRateLimit;
  if (existing) return existing;
  const created = new Map<string, RateWindow>();
  globalForRateLimit.__agentStoreRateLimit = created;
  return created;
}

const buckets: Map<string, RateWindow> = initBuckets();

let lastSweep = 0;

function sweep(now: number): void {
  // Sweep at most once a minute; drop windows that have fully elapsed.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Returns `true` if the call is ALLOWED (within the limit) and records it;
 * returns `false` if the limit for the current window has been exceeded.
 *
 * @param key      a stable identity for the caller (e.g. `agents:1.2.3.4`)
 * @param limit    max allowed calls per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/**
 * Best-effort client IP for use as a rate-limit key. Cloudflare sets
 * `cf-connecting-ip`; `x-forwarded-for` (client first) is the fallback. Falls back
 * to a constant so the limiter still functions (shared bucket) with no IP.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

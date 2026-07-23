import { customEndpointStatus } from "./openai-compatible";

/**
 * Reachability signal for the OpenAI-compatible (local model) endpoint.
 *
 * The endpoint's "connected" state used to be pure config presence (a base URL
 * + model in custom-endpoint.json), so a stopped Ollama/LM Studio/vLLM server
 * still showed "Connected" in the AI Models page and offered its model in the
 * chat picker — with every turn failing. This module answers "is the server
 * actually there?" with the same shape as the anthropic credential probe:
 * an async refresh (TTL'd, coalesced) warmed by the status routes, and a sync
 * cached read for the row builders.
 *
 * The probe hits `GET <baseUrl>/models` — the one endpoint every
 * OpenAI-compatible server (Ollama, LM Studio, vLLM, llama.cpp, Jan) exposes.
 * ANY HTTP response counts as reachable, whatever the status: a 401/404 still
 * proves a server is listening (a key/model problem surfaces as its own typed
 * turn error). Only a network failure (refused, DNS, timeout) reads
 * unreachable. The TURN path never consults this cache — an unreachable server
 * at turn time should fail the real request and surface the network card, not
 * a fabricated "not connected".
 */

/** The last probe verdict, keyed by the base URL it probed — a config change
 *  (new base URL) invalidates it implicitly. */
let cache: { baseUrl: string; ok: boolean; at: number } | null = null;

/** An in-flight probe, so concurrent status polls share ONE request. Keyed by
 *  the URL it is probing: a reconfiguration mid-probe must start a fresh probe
 *  for the NEW URL, not adopt the old server's answer. */
let inFlight: { baseUrl: string; promise: Promise<boolean> } | null = null;

/** Reuse window for a fresh verdict; the status routes poll far faster than a
 *  local server's up/down state changes. */
const PROBE_TTL_MS = 10_000;

/** A local server answers /models in milliseconds; anything slower than this
 *  is down (and the status route awaits us, so the bound must stay tight). */
const PROBE_TIMEOUT_MS = 2_000;

export type EndpointProbe = (baseUrl: string) => Promise<boolean>;

async function fetchProbe(baseUrl: string): Promise<boolean> {
  try {
    await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true; // any HTTP response — the server is listening
  } catch {
    return false;
  }
}

/**
 * Re-probe the configured endpoint and update the cache. Never throws. With no
 * endpoint configured there is nothing to probe (and `configured` is already
 * false); the cache is dropped so a later config starts fresh. `probe` is
 * injected in tests.
 */
export async function refreshEndpointReachability(
  probe: EndpointProbe = fetchProbe,
): Promise<boolean> {
  const baseUrl = customEndpointStatus().endpoint?.baseUrl;
  if (!baseUrl) {
    cache = null;
    return false;
  }
  if (
    cache &&
    cache.baseUrl === baseUrl &&
    Date.now() - cache.at < PROBE_TTL_MS
  ) {
    return cache.ok;
  }
  if (inFlight && inFlight.baseUrl === baseUrl) return inFlight.promise;
  const promise = (async () => {
    const ok = await probe(baseUrl);
    cache = { baseUrl, ok, at: Date.now() };
    return ok;
  })();
  inFlight = { baseUrl, promise };
  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

/**
 * The sync verdict for the CURRENTLY configured base URL. Optimistic before the
 * first probe (or right after a base-URL change): "unknown" must not flash a
 * working local model as disconnected — the status routes warm the cache before
 * building rows, so real answers arrive with the first poll.
 */
export function endpointReachableCached(): boolean {
  const baseUrl = customEndpointStatus().endpoint?.baseUrl;
  if (!baseUrl) return false;
  if (cache && cache.baseUrl === baseUrl) return cache.ok;
  return true;
}

/** Drop the cached verdict (tests; endpoint reconfiguration takes effect via
 *  the baseUrl key, so production code doesn't need to call this). */
export function resetEndpointReachability(): void {
  cache = null;
  inFlight = null;
}

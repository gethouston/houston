import { bridgeReadiness, refreshBridgeReadiness } from "./bridge-readiness";
import { customEndpointStatus } from "./openai-compatible";

let cache: { baseUrl: string; ok: boolean; at: number } | null = null;

let inFlight: { baseUrl: string; promise: Promise<boolean> } | null = null;

const PROBE_TTL_MS = 10_000;

const PROBE_TIMEOUT_MS = 2_000;

export type EndpointProbe = (baseUrl: string) => Promise<boolean>;

// WHY: Any HTTP answer, 401 and 404 included, means reachable; only connect errors do not. ADR-0007
async function fetchProbe(baseUrl: string): Promise<boolean> {
  try {
    await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export async function refreshEndpointReachability(
  probe: EndpointProbe = fetchProbe,
): Promise<boolean> {
  const endpoint = customEndpointStatus().endpoint;
  if (endpoint?.bridge)
    return refreshBridgeReadiness(endpoint.bridge, endpoint.model);
  const baseUrl = endpoint?.baseUrl;
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

export function endpointReachableCached(): boolean {
  const endpoint = customEndpointStatus().endpoint;
  if (endpoint?.bridge) return bridgeReadiness(endpoint.bridge, endpoint.model);
  const baseUrl = endpoint?.baseUrl;
  if (!baseUrl) return false;
  if (cache && cache.baseUrl === baseUrl) return cache.ok;
  return true;
}

export function resetEndpointReachability(): void {
  cache = null;
  inFlight = null;
}

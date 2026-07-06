import type { ServerResponse } from "node:http";
import type { Capabilities, LiveCatalog } from "@houston/protocol";
import type { UserId } from "../domain/types";
import type { CredentialStore, WorkspaceStore } from "../ports";
import { isCloudProvider } from "../providers";
import { mapOpenRouterCatalog } from "../providers/openrouter-catalog";
import { json } from "./http";

/**
 * Live model-catalog route. Fetches the user's OpenRouter model list at request
 * time and returns it as a protocol `LiveCatalog` for the model picker.
 *
 * Graceful degradation is intentional, NOT a swallowed error: an empty catalog
 * is the correct answer when there's nothing to fetch —
 *  - no OpenRouter key connected for the workspace, or
 *  - the deployment is egress-locked (cloud profile; openrouter.ai isn't on the
 *    per-turn sandbox allowlist, so the provider is `cloud:false`).
 * A genuine fetch failure (network / non-2xx / bad JSON) throws so the server's
 * top-level handler surfaces it as a real 500 — the beta no-silent-failures rule.
 */

const OPENROUTER = "openrouter";
const MODELS_URL = "https://openrouter.ai/api/v1/models";

/** In-memory TTL so repeated picker opens don't hammer OpenRouter. */
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  catalog: LiveCatalog;
}

export interface ProviderCatalogDeps {
  store: WorkspaceStore;
  credentials: CredentialStore;
  capabilities: Capabilities;
}

/**
 * Seam for tests + the TTL cache: fetch, map, and remember by api key. Exposed
 * as an object so a test can inject a fake fetch/clock and reset the cache.
 */
export interface CatalogFetcher {
  fetchImpl: typeof fetch;
  now: () => number;
  cache: Map<string, CacheEntry>;
}

const defaultFetcher: CatalogFetcher = {
  fetchImpl: fetch,
  now: Date.now,
  cache: new Map(),
};

/** Whether this deployment can actually reach openrouter.ai for a live fetch. */
function reachable(profile: Capabilities["profile"]): boolean {
  return profile === "local" || isCloudProvider(OPENROUTER);
}

/**
 * Fetch (or serve from the TTL cache) the OpenRouter catalog for one api key.
 * Throws on a real transport/HTTP/parse failure — the caller lets it propagate.
 */
async function loadCatalog(
  apiKey: string,
  fetcher: CatalogFetcher,
): Promise<LiveCatalog> {
  const hit = fetcher.cache.get(apiKey);
  const nowMs = fetcher.now();
  if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.catalog;

  const res = await fetcher.fetchImpl(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(
      `OpenRouter models fetch failed (${res.status}): ${await res
        .text()
        .catch(() => "")}`,
    );
  }
  const payload = await res.json();
  const catalog = mapOpenRouterCatalog(payload, nowMs);
  fetcher.cache.set(apiKey, { at: nowMs, catalog });
  return catalog;
}

/**
 * `GET /v1/providers/openrouter/models` → 200 `LiveCatalog`. User-scoped (the
 * caller's personal workspace holds the connect-once OpenRouter key). Returns
 * true when handled. `fetcher` is a test seam; production uses the module default.
 */
export async function handleProviderCatalog(
  deps: ProviderCatalogDeps,
  userId: UserId,
  method: string,
  path: string,
  res: ServerResponse,
  fetcher: CatalogFetcher = defaultFetcher,
): Promise<boolean> {
  if (method !== "GET" || path !== "/v1/providers/openrouter/models")
    return false;

  // Egress-locked deployment → nothing to fetch, empty catalog (not an error).
  if (!reachable(deps.capabilities.profile)) {
    json(res, 200, []);
    return true;
  }

  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  const cred = await deps.credentials.get(ws.id, OPENROUTER);
  // No connected key → the picker simply shows the baked snapshot; empty here.
  if (!cred?.accessToken) {
    json(res, 200, []);
    return true;
  }

  json(res, 200, await loadCatalog(cred.accessToken, fetcher));
  return true;
}

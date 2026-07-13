/**
 * The public Agent Store catalog — browse/read endpoints only.
 *
 * These routes are anonymous by design (the gateway serves them with
 * `Access-Control-Allow-Origin: *`), so unlike the publish flow there is no
 * bearer and no 401 discipline here: plain `fetch` against the store gateway.
 * Works signed-out, on every deployment shape.
 *
 * The API base mirrors the publish adapter's resolution: the desktop shell's
 * `window.__HOUSTON_STORE__` target when installed (local-sidecar mode, signed
 * in), else the build-time `VITE_AGENTSTORE_GATEWAY_URL`, else production.
 */

import type {
  StoreCatalogAgentDetail,
  StoreCatalogPage,
  StoreCatalogQuery,
} from "./types.ts";

/**
 * A failed catalog read. Deliberately NOT `HoustonEngineError` (this module
 * must not pull the engine client into consumers that only browse), but it
 * carries the same structural `status` every caller switches on.
 */
export class StoreCatalogError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`store catalog request failed (${status})`);
    this.name = "StoreCatalogError";
    this.status = status;
    this.body = body;
  }
}

declare global {
  interface Window {
    __HOUSTON_STORE__?: { baseUrl: string; token: string };
  }
}

const DEFAULT_STORE_GATEWAY = "https://gateway.gethouston.ai";

/** The gateway base the public catalog reads go to. */
export function storeCatalogApiBase(): string {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.baseUrl : "";
  const built = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_AGENTSTORE_GATEWAY_URL;
  return (installed || built || DEFAULT_STORE_GATEWAY).replace(/\/+$/, "");
}

async function storeGet<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${storeCatalogApiBase()}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new StoreCatalogError(res.status, await res.json().catch(() => ({})));
  }
  return (await res.json()) as T;
}

/** One page of published + public listings (server page size 24). */
export function fetchStoreCatalog(
  query: StoreCatalogQuery = {},
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCatalogPage> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.category) params.set("category", query.category);
  if (query.sort) params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return storeGet(`/v1/agentstore/agents${qs ? `?${qs}` : ""}`, fetchImpl);
}

/** A listing's summary + renderable IR parts. 404s when not published. */
export function fetchStoreAgent(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCatalogAgentDetail> {
  return storeGet(
    `/v1/agentstore/agents/${encodeURIComponent(slug)}`,
    fetchImpl,
  );
}

/**
 * Count an in-app install against the listing (anonymous, trigger-maintained).
 * Callers fire-and-forget this AFTER the install flow starts — a failed ping
 * must never block an install, so catch + report at the call site.
 */
export async function pingStoreInstall(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${storeCatalogApiBase()}/v1/agentstore/agents/${encodeURIComponent(slug)}/installs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "houston" }),
    },
  );
  if (!res.ok) {
    throw new StoreCatalogError(res.status, await res.json().catch(() => ({})));
  }
}

/**
 * The public Agent Store catalog — browse/read endpoints only.
 *
 * These routes are anonymous by design (the gateway serves them with
 * `Access-Control-Allow-Origin: *`), so unlike the publish flow there is no
 * bearer and no 401 discipline here: plain reads against the store gateway.
 * Works signed-out, on every deployment shape.
 *
 * The transport is the shared {@link AgentStoreClient}
 * (`@houston/agentstore-client`), constructed per call with the resolved
 * gateway base and the caller-supplied `fetchImpl`. The API base mirrors the
 * publish adapter's resolution: the desktop shell's `window.__HOUSTON_STORE__`
 * target when installed (local-sidecar mode, signed in), else the build-time
 * `VITE_AGENTSTORE_GATEWAY_URL`, else production.
 */

import { AgentStoreClient, StoreApiError } from "@houston/agentstore-client";
import type {
  ReportInput,
  StoreCatalogAgentDetail,
  StoreCatalogPage,
  StoreCatalogQuery,
  StoreCategory,
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

/** GET reads announce JSON, matching the former plain-fetch requests. */
const ACCEPT_JSON = { headers: { Accept: "application/json" } };

/** The gateway base the public catalog reads go to. */
export function storeCatalogApiBase(): string {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.baseUrl : "";
  const built = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_AGENTSTORE_GATEWAY_URL;
  return (installed || built || DEFAULT_STORE_GATEWAY).replace(/\/+$/, "");
}

/** A store client bound to the resolved gateway base and the given fetch. */
function catalogClient(fetchImpl: typeof fetch): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: storeCatalogApiBase(), fetchImpl });
}

/**
 * Map the SDK's {@link StoreApiError} back onto the structural
 * {@link StoreCatalogError} this module's callers switch on. A network-level
 * failure (status `0`) carries no HTTP status, so its original thrown cause is
 * re-raised unchanged — exactly as the former plain-fetch code let it propagate.
 */
function asCatalogError(err: unknown): unknown {
  if (err instanceof StoreApiError) {
    if (err.status === 0) return err.body instanceof Error ? err.body : err;
    return new StoreCatalogError(err.status, err.body);
  }
  return err;
}

/** One page of published + public listings (server page size 24). */
export async function fetchStoreCatalog(
  query: StoreCatalogQuery = {},
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCatalogPage> {
  try {
    return await catalogClient(fetchImpl).listAgents(query, ACCEPT_JSON);
  } catch (err) {
    throw asCatalogError(err);
  }
}

/** A listing's summary + renderable IR parts. 404s when not published. */
export async function fetchStoreAgent(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCatalogAgentDetail> {
  try {
    return await catalogClient(fetchImpl).getAgent(slug, ACCEPT_JSON);
  } catch (err) {
    throw asCatalogError(err);
  }
}

/** The controlled category vocabulary for the browse filter chips (anonymous). */
export async function fetchStoreCategories(
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCategory[]> {
  try {
    return await catalogClient(fetchImpl).listCategories(ACCEPT_JSON);
  } catch (err) {
    throw asCatalogError(err);
  }
}

/**
 * File an anonymous abuse report against a published listing. The gateway
 * rate-limits these (5/min/IP); a rejection surfaces as a {@link StoreCatalogError}
 * the caller toasts.
 */
export async function reportStoreAgent(
  slug: string,
  input: ReportInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await catalogClient(fetchImpl).reportAgent(slug, input);
  } catch (err) {
    throw asCatalogError(err);
  }
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
  try {
    await catalogClient(fetchImpl).recordInstall(slug, "houston");
  } catch (err) {
    throw asCatalogError(err);
  }
}

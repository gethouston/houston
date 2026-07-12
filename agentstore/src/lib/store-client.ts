/**
 * Client-side gateway calls that carry a user bearer or are anonymous mutations.
 * Runs in the browser (client components only): server components never see a
 * token. Reads the build-time-inlined `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`, so
 * these requests are cross-origin to the gateway and rely on the gateway's CORS
 * grant for the store origin.
 *
 * Every call maps a non-OK response to `StoreApiError` (status + `code`) so UIs
 * branch on the code, and no failure is swallowed.
 */
import {
  type AgentSummary,
  type CatalogPage,
  clientGatewayBase,
  STORE_API_PREFIX,
  toStoreApiError,
} from "./store-api-types";

export { StoreApiError } from "./store-api-types";
export type { AgentSummary };

/** Absolute gateway URL for a store API path. */
function url(path: string): string {
  return `${clientGatewayBase()}${STORE_API_PREFIX}${path}`;
}

/** Fetch with a bearer token, JSON content-type for bodied calls, no caching. */
async function authed(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body) headers.set("content-type", "application/json");
  const res = await fetch(url(path), { ...init, headers, cache: "no-store" });
  if (!res.ok) throw await toStoreApiError(res);
  return res;
}

/** The caller's agents in every state (`GET /me/agents`). */
export async function listMyAgents(token: string): Promise<AgentSummary[]> {
  const res = await authed(token, "/me/agents");
  const body = (await res.json()) as { items: AgentSummary[] };
  return body.items;
}

/** Result of claiming an unclaimed agent. */
export interface ClaimResult {
  agentId: string;
  slug?: string;
}

/** Claim an unclaimed agent with the code from the claim link (`POST /claim`). */
export async function claimAgent(
  token: string,
  input: { agentId: string; code: string },
): Promise<ClaimResult> {
  const res = await authed(token, "/claim", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as ClaimResult;
}

/** The mutations `PATCH /agents/{id}` accepts. Exactly one intent per call. */
export type AgentPatch =
  | { identity: AgentIdentityPatch }
  | { publish: true }
  | { unpublish: true }
  | { visibility: "unlisted" }
  | { requestPublic: true };

/** The editable identity fields on a `PATCH … {identity}` call. */
export interface AgentIdentityPatch {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  creator?: { displayName: string; url?: string };
}

/**
 * Apply a patch to an owned agent. Returns nothing: the gateway's PATCH response
 * body is not part of the pinned contract, so callers re-read `listMyAgents`
 * after a successful mutation rather than trusting a response shape. A failure
 * (403 not_owner, 409 version_conflict, …) throws `StoreApiError`.
 */
export async function patchAgent(
  token: string,
  id: string,
  patch: AgentPatch,
): Promise<void> {
  await authed(token, `/agents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Soft-delete an owned agent (`DELETE /agents/{id}`). */
export async function deleteAgent(token: string, id: string): Promise<void> {
  await authed(token, `/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** The moderation reasons accepted by `POST /agents/{slug}/reports`. */
export type ReportReason =
  | "spam"
  | "malicious"
  | "impersonation"
  | "inappropriate"
  | "other";

/** An abuse report body. `details`/`contact` are optional free text. */
export interface ReportInput {
  reason: ReportReason;
  details?: string;
  contact?: string;
}

/** File an anonymous abuse report against a published agent. */
export async function reportAgent(
  slug: string,
  input: ReportInput,
): Promise<void> {
  const res = await fetch(url(`/agents/${encodeURIComponent(slug)}/reports`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await toStoreApiError(res);
}

/** Re-export the catalog page type for parity with server reads. */
export type { CatalogPage };

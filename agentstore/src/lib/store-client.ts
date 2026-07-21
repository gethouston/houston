/**
 * Client-side facade over the Agent Store SDK for calls that carry a user bearer
 * or are anonymous mutations. Runs in the browser (client components only):
 * server components never see a token. Reads the build-time-inlined
 * `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`, so these requests are cross-origin to the
 * gateway and rely on the gateway's CORS grant for the store origin.
 *
 * This module owns only the browser-specific concerns: the public gateway
 * origin, wrapping the caller's freshly-minted bearer into the SDK's `getToken`,
 * and forcing `cache: "no-store"` on the authed reads. All HTTP and error
 * plumbing — including the `StoreApiError` every UI branches on — lives in
 * `@houston/agentstore-client`.
 */
import {
  type AgentPatch,
  AgentStoreClient,
  type AvatarUploadResult,
  type ClaimInput,
  type ClaimResult,
  type CreatorAnalytics,
  type CreatorProfile,
  type CreatorProfilePatch,
  type HandleAvailability,
  type ReportInput,
  type StoreAgentSummary,
  type StoreRequestOptions,
} from "@houston/agentstore-client";
import { clientGatewayBase } from "./store-api-types";

/** Authed calls must never be served from the browser HTTP cache. */
const NO_STORE: StoreRequestOptions = { init: { cache: "no-store" } };

/** An SDK client that authorizes every call with the caller's bearer. */
function authed(token: string): AgentStoreClient {
  return new AgentStoreClient({
    baseUrl: clientGatewayBase(),
    getToken: () => token,
  });
}

/** An SDK client for anonymous mutations (no bearer). */
function anon(): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: clientGatewayBase() });
}

/** The caller's agents in every state (`GET /me/agents`). */
export function listMyAgents(token: string): Promise<StoreAgentSummary[]> {
  return authed(token).listMyAgents(NO_STORE);
}

/** Claim an unclaimed agent with the code from the claim link (`POST /claim`). */
export function claimAgent(
  token: string,
  input: ClaimInput,
): Promise<ClaimResult> {
  return authed(token).claimAgent(input, NO_STORE);
}

/**
 * Apply a patch to an owned agent. Returns nothing: callers re-read
 * `listMyAgents` after a successful mutation rather than trusting the PATCH
 * response shape. A failure (403 not_owner, 409 version_conflict, …) throws
 * `StoreApiError`.
 */
export async function patchAgent(
  token: string,
  id: string,
  patch: AgentPatch,
): Promise<void> {
  await authed(token).patchAgent(id, patch, NO_STORE);
}

/** Soft-delete an owned agent (`DELETE /agents/{id}`). */
export async function deleteAgent(token: string, id: string): Promise<void> {
  await authed(token).deleteAgent(id, NO_STORE);
}

/** File an anonymous abuse report against a published agent. */
export async function reportAgent(
  slug: string,
  input: ReportInput,
): Promise<void> {
  await anon().reportAgent(slug, input);
}

/** File an anonymous abuse report against a creator. */
export async function reportCreator(
  handle: string,
  input: ReportInput,
): Promise<void> {
  await anon().reportCreator(handle, input);
}

/** The caller's own creator profile, or null when never materialized. */
export function getMyProfile(token: string): Promise<CreatorProfile | null> {
  return authed(token).getMyProfile(NO_STORE);
}

/** Upsert the caller's creator profile; returns the saved profile. */
export function patchMyProfile(
  token: string,
  patch: CreatorProfilePatch,
): Promise<CreatorProfile> {
  return authed(token).patchMyProfile(patch, NO_STORE);
}

/** Whether a handle is claimable by the caller, with a reason when not. */
export function checkHandle(
  token: string,
  handle: string,
): Promise<HandleAvailability> {
  return authed(token).checkHandle(handle, NO_STORE);
}

/**
 * Replace the caller's avatar with `blob` (multipart, field `file`). The SDK
 * builds the FormData; `fetch` sets the multipart boundary.
 */
export function uploadAvatar(
  token: string,
  blob: Blob,
): Promise<AvatarUploadResult> {
  return authed(token).uploadAvatar(blob, NO_STORE);
}

/** Clear the caller's avatar. Idempotent. */
export async function deleteAvatar(token: string): Promise<void> {
  await authed(token).deleteAvatar(NO_STORE);
}

/** Per-UTC-day install analytics over the caller's owned agents. */
export function getMyAnalytics(
  token: string,
  days?: number,
): Promise<CreatorAnalytics> {
  return authed(token).getMyAnalytics(days, NO_STORE);
}

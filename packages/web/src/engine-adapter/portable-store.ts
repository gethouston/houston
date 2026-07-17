/**
 * Agent Store publication (account-based, no manage tokens).
 *
 * The host is credential-free: it gathers the IR (`portable/store-ir`) and
 * records a token-free pointer (`portable/store-publication`) — those calls live
 * in `portable-store-pointer.ts`. The APP owns the network: it drives the gateway
 * `/v1/agentstore` API through the shared {@link AgentStoreClient}, with the
 * user's OWN bearer + the 401-refresh/replay discipline riding the injected
 * `storeAuthFetch` seam (which targets the store gateway even when the engine is
 * a local sidecar). Pure request-body mapping lives in `portable-map.ts`.
 */

import {
  type AgentPatch,
  AgentStoreClient,
  type CreateAgentRequest,
  type CreateAgentResponse,
  StoreApiError,
} from "@houston/agentstore-client";
import type {
  MyAgent,
  StorePublicationStatus,
  StorePublishRequest,
  StorePublishResponse,
  StoreUnpublishResponse,
  StoreUpdateResponse,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import type { ControlPlaneConfig } from "./control-plane";
import {
  clearPointer,
  gatherStoreIr,
  readPointer,
  type StorePointer,
  writePointer,
} from "./portable-store-pointer";
import { STORE_SITE_URL, storeApiBase, storeAuthFetch } from "./store-gateway";

/**
 * The store-gateway client for the publish flow. Authorization is owned by the
 * injected {@link storeAuthFetch}: it sets the final `Authorization` header from
 * the live session bearer and carries the single 401 refresh/replay, overriding
 * whatever the client sends. `getToken` mirrors that seam's bearer resolution so
 * the client's own pre-flight auth guard passes exactly when a request would be
 * sent (the value itself is superseded by the fetch seam).
 */
function storeClient(cfg: ControlPlaneConfig): AgentStoreClient {
  return new AgentStoreClient({
    baseUrl: storeApiBase(cfg),
    fetchImpl: storeAuthFetch(cfg.token),
    getToken: () =>
      (typeof window !== "undefined" && window.__HOUSTON_STORE__?.token) ||
      cfg.token,
  });
}

/**
 * Run a store-client call, re-mapping the SDK's {@link StoreApiError} onto the
 * adapter's {@link HoustonEngineError} so publish callers keep branching on the
 * one engine-error class. A network-level failure (status `0`) rethrows its
 * underlying cause verbatim — exactly as the hand-rolled `fetch` propagated it.
 */
async function asEngineError<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof StoreApiError) {
      if (err.status === 0) throw err.body;
      throw new HoustonEngineError(err.status, err.body);
    }
    throw err;
  }
}

/** Publish the agent to the store; returns the public share URL. */
export async function publishToStore(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: StorePublishRequest,
): Promise<StorePublishResponse> {
  const ir = await gatherStoreIr(cfg, agentId, req);
  const existing = await readPointer(cfg, agentId);
  const client = storeClient(cfg);
  // A kept pointer (e.g. left by an unpublish) re-publishes the SAME store agent
  // so a re-publish never duplicates the listing.
  if (existing) {
    // The single-intent `AgentPatch` union does not model the combined
    // {ir, publish} body the gateway applies in order; the wire is unchanged.
    await asEngineError(() =>
      client.patchAgent(existing.storeAgentId, {
        ir,
        publish: true,
      } as AgentPatch),
    );
    await writePointer(cfg, agentId, existing);
    return {
      shareUrl: existing.shareUrl,
      slug: existing.slug,
      storeAgentId: existing.storeAgentId,
    };
  }
  const created = (await asEngineError(() =>
    client.createAgent({ ir, publish: true } as CreateAgentRequest),
  )) as Required<CreateAgentResponse>;
  const pointer: StorePointer = {
    storeAgentId: created.agentId,
    slug: created.slug,
    shareUrl: created.shareUrl,
    publishedAt: new Date().toISOString(),
  };
  await writePointer(cfg, agentId, pointer);
  return {
    shareUrl: created.shareUrl,
    slug: created.slug,
    storeAgentId: created.agentId,
  };
}

/** Re-publish an already-listed agent with a freshly gathered selection. */
export async function updatePublication(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: StorePublishRequest,
): Promise<StoreUpdateResponse> {
  const pointer = await readPointer(cfg, agentId);
  if (!pointer) {
    throw new HoustonEngineError(404, { error: "this agent is not published" });
  }
  const ir = await gatherStoreIr(cfg, agentId, req);
  // Combined {ir, identity} patch — see the note in `publishToStore`.
  await asEngineError(() =>
    storeClient(cfg).patchAgent(pointer.storeAgentId, {
      ir,
      identity: req.identity,
    } as AgentPatch),
  );
  return { shareUrl: pointer.shareUrl, slug: pointer.slug };
}

/** Take the listing down; the pointer is kept so a re-publish reuses the agent. */
export async function unpublishFromStore(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<StoreUnpublishResponse> {
  const pointer = await readPointer(cfg, agentId);
  if (!pointer) return { ok: true };
  await asEngineError(() =>
    storeClient(cfg).patchAgent(pointer.storeAgentId, { unpublish: true }),
  );
  return { ok: true };
}

/** Whether the agent is linked to a listing, and its live state (account-based). */
export async function getPublication(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<StorePublicationStatus> {
  const pointer = await readPointer(cfg, agentId);
  if (!pointer) {
    return { published: false, linked: false, storeUrl: STORE_SITE_URL };
  }
  const items = await asEngineError(() => storeClient(cfg).listMyAgents());
  const item = items.find((a) => a.id === pointer.storeAgentId);
  if (!item) {
    // The store agent is gone (deleted upstream) — drop the stale pointer.
    await clearPointer(cfg, agentId);
    return { published: false, linked: false, storeUrl: STORE_SITE_URL };
  }
  return {
    published: item.state === "published",
    linked: true,
    storeAgentId: pointer.storeAgentId,
    slug: item.slug ?? pointer.slug,
    shareUrl: pointer.shareUrl,
    publishedAt: pointer.publishedAt,
    storeUrl: STORE_SITE_URL,
    identity: {
      name: item.name,
      description: item.description,
      ...(item.tagline ? { tagline: item.tagline } : {}),
      category: item.category,
      tags: item.tags,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Owner management (the "my agents" panel — account-based, no manage tokens)
//
// These act on a store agent by its gateway id, read live off `GET /me/agents`,
// with no host-side pointer involved. Each re-maps the SDK's StoreApiError onto
// the adapter's HoustonEngineError via `asEngineError`, exactly like publish.
// ────────────────────────────────────────────────────────────────────────

/** Every listing the caller owns, in all lifecycle states (`GET /me/agents`). */
export function listMyStoreAgents(cfg: ControlPlaneConfig): Promise<MyAgent[]> {
  return asEngineError(() => storeClient(cfg).listMyAgents());
}

/** Ask an admin to make an owned listing public (`PATCH … {requestPublic}`). */
export async function requestStorePublic(
  cfg: ControlPlaneConfig,
  storeAgentId: string,
): Promise<void> {
  await asEngineError(() =>
    storeClient(cfg).patchAgent(storeAgentId, { requestPublic: true }),
  );
}

/** Drop a public listing back to unlisted (`PATCH … {visibility:"unlisted"}`). */
export async function setStoreVisibilityUnlisted(
  cfg: ControlPlaneConfig,
  storeAgentId: string,
): Promise<void> {
  await asEngineError(() =>
    storeClient(cfg).patchAgent(storeAgentId, { visibility: "unlisted" }),
  );
}

/** Take an owned listing down by its gateway id (`PATCH … {unpublish}`). */
export async function unpublishStoreAgentById(
  cfg: ControlPlaneConfig,
  storeAgentId: string,
): Promise<void> {
  await asEngineError(() =>
    storeClient(cfg).patchAgent(storeAgentId, { unpublish: true }),
  );
}

/** Soft-delete an owned listing by its gateway id (`DELETE /agents/{id}`). */
export async function deleteStoreAgentById(
  cfg: ControlPlaneConfig,
  storeAgentId: string,
): Promise<void> {
  await asEngineError(() => storeClient(cfg).deleteAgent(storeAgentId));
}

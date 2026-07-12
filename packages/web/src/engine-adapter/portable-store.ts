/**
 * Agent Store publication (account-based, no manage tokens).
 *
 * The host is credential-free: it gathers the IR (`portable/store-ir`) and
 * records a token-free pointer (`portable/store-publication`) — those calls live
 * in `portable-store-pointer.ts`. The APP owns the network: it POSTs the IR to
 * the gateway `/v1/agentstore` API with the user's OWN bearer via
 * `storeAuthFetch` (which targets the store gateway even when the engine is a
 * local sidecar). Pure request-body mapping lives in `portable-map.ts`.
 */

import type {
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

/** The subset of a `me/agents` item the manage view needs (see the wire contract). */
interface StoreMeAgent {
  id: string;
  slug: string | null;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  state: string;
}

/** A store gateway call with the user's own bearer; non-2xx surfaces verbatim. */
async function storeFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await storeAuthFetch(cfg.token)(`${storeApiBase(cfg)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new HoustonEngineError(
      res.status,
      await res.json().catch(() => ({})),
    );
  }
  return res;
}

/** Publish the agent to the store; returns the public share URL. */
export async function publishToStore(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: StorePublishRequest,
): Promise<StorePublishResponse> {
  const ir = await gatherStoreIr(cfg, agentId, req);
  const existing = await readPointer(cfg, agentId);
  // A kept pointer (e.g. left by an unpublish) re-publishes the SAME store agent
  // so a re-publish never duplicates the listing.
  if (existing) {
    await storeFetch(
      cfg,
      `/v1/agentstore/agents/${encodeURIComponent(existing.storeAgentId)}`,
      { method: "PATCH", body: JSON.stringify({ ir, publish: true }) },
    );
    await writePointer(cfg, agentId, existing);
    return {
      shareUrl: existing.shareUrl,
      slug: existing.slug,
      storeAgentId: existing.storeAgentId,
    };
  }
  const res = await storeFetch(cfg, "/v1/agentstore/agents", {
    method: "POST",
    body: JSON.stringify({ ir, publish: true }),
  });
  const created = (await res.json()) as {
    agentId: string;
    slug: string;
    shareUrl: string;
  };
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
  await storeFetch(
    cfg,
    `/v1/agentstore/agents/${encodeURIComponent(pointer.storeAgentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ir, identity: req.identity }),
    },
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
  await storeFetch(
    cfg,
    `/v1/agentstore/agents/${encodeURIComponent(pointer.storeAgentId)}`,
    { method: "PATCH", body: JSON.stringify({ unpublish: true }) },
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
  const res = await storeFetch(cfg, "/v1/agentstore/me/agents");
  const { items } = (await res.json()) as { items: StoreMeAgent[] };
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
      description: item.description ?? "",
      ...(item.tagline ? { tagline: item.tagline } : {}),
      category: item.category ?? "",
      tags: item.tags ?? [],
    },
  };
}

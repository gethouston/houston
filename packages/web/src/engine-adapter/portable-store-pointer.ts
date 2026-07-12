/**
 * The credential-free host calls behind the Agent Store publication flow: gather
 * the selected content into an AgentIR, and read/write/clear the machine-local
 * pointer the host keeps (`{ storeAgentId, slug, shareUrl, publishedAt }` — no
 * secrets). The gateway half (creating/patching the listing with the user's
 * bearer) lives in `portable-store.ts`.
 */

import type { StorePublishRequest } from "../../../../ui/engine-client/src/types";
import type { ControlPlaneConfig } from "./control-plane";
import { hostFetch } from "./host-fetch";
import { storePublishBody } from "./portable-map";

/** The machine-local pointer the host keeps for a published agent (no secrets). */
export interface StorePointer {
  storeAgentId: string;
  slug: string;
  shareUrl: string;
  publishedAt: string;
}

const pointerPath = (agentId: string) =>
  `/agents/${encodeURIComponent(agentId)}/portable/store-publication`;

/** Gather the selected content into a publish-ready AgentIR (no network I/O). */
export async function gatherStoreIr(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: StorePublishRequest,
): Promise<unknown> {
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/portable/store-ir`,
    { method: "POST", body: JSON.stringify(storePublishBody(req)) },
  );
  return ((await res.json()) as { ir: unknown }).ir;
}

/** Read the machine-local pointer, or null when the agent was never published. */
export async function readPointer(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<StorePointer | null> {
  const res = await hostFetch(cfg, pointerPath(agentId));
  return ((await res.json()) as { pointer: StorePointer | null }).pointer;
}

/** Record the pointer after a successful gateway publish. */
export async function writePointer(
  cfg: ControlPlaneConfig,
  agentId: string,
  pointer: StorePointer,
): Promise<void> {
  await hostFetch(cfg, pointerPath(agentId), {
    method: "POST",
    body: JSON.stringify(pointer),
  });
}

/** Drop the pointer (after the store agent is gone upstream). */
export async function clearPointer(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<void> {
  await hostFetch(cfg, pointerPath(agentId), { method: "DELETE" });
}

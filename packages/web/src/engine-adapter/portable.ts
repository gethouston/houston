/**
 * Portable agents ("Share with a friend" / "From a friend") on the new engine.
 *
 * Export preview + packaging go through the host's v3 portable routes. An
 * uploaded `.houstonagent` is unpacked IN THE BROWSER with the same domain
 * code the host runs (`@houston/domain`), held in memory under a packageId,
 * and posted to `/v1/portable/install` when the user confirms — nothing is
 * staged server-side, and the export download is just the route's response
 * bytes (no pod-volume storage on cloud).
 *
 * Pure shape mappings live in `portable-map.ts`.
 */

import { unpackAgent } from "@houston/domain";
import type {
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableUploadPreviewResponse,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import {
  type ControlPlaneConfig,
  liveToken,
  rememberAgentColor,
} from "./control-plane";
import { packagePreview, toBase64, toWireSelection } from "./portable-map";

/** Uploaded archives awaiting install, keyed by the packageId handed to the wizard. */
const uploads = new Map<string, Uint8Array>();

async function hostFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${liveToken(cfg.token)}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new HoustonEngineError(
      res.status,
      await res.json().catch(() => ({})),
    );
  }
  return res;
}

/** The agent's exportable content, for the "Share with a friend" pick screen. */
export async function exportPreview(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<PortableInventoryPreview> {
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/portable/preview`,
  );
  return (await res.json()) as PortableInventoryPreview;
}

/** Build the `.houstonagent` on the host and return its bytes for saving. */
export async function exportPackage(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: PortableExportRequest,
): Promise<ArrayBuffer> {
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/portable/export`,
    { method: "POST", body: JSON.stringify(toWireSelection(req.selection)) },
  );
  return await res.arrayBuffer();
}

/**
 * Unpack an uploaded `.houstonagent` locally and park the bytes until the
 * user confirms the install. Throws the domain's own message on junk bytes /
 * future formats — the wizard toasts it verbatim.
 */
export function previewUpload(
  bytes: ArrayBuffer | Uint8Array,
): PortableUploadPreviewResponse {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pkg = unpackAgent(u8);
  const packageId = crypto.randomUUID();
  uploads.set(packageId, u8);
  return { packageId, ...packagePreview(pkg) };
}

/** Install the parked archive as a new agent via the host. */
export async function install(
  cfg: ControlPlaneConfig,
  req: PortableInstallRequest,
): Promise<PortableInstalledAgent> {
  const bytes = uploads.get(req.packageId);
  if (!bytes) {
    throw new Error(
      "The uploaded agent file is no longer available — pick the file again.",
    );
  }
  const res = await hostFetch(cfg, "/v1/portable/install", {
    method: "POST",
    body: JSON.stringify({
      agentName: req.agentName,
      archive: toBase64(bytes),
      selection: toWireSelection(req.selection),
    }),
  });
  const { agent } = (await res.json()) as {
    agent: { id: string; name: string };
  };
  // Color is a client-side overlay in control-plane mode (the host model is
  // id/name only) — same contract as createAgent.
  if (req.agentColor) rememberAgentColor(agent.id, req.agentColor);
  uploads.delete(req.packageId);
  return {
    agentPath: agent.id, // in control-plane mode the agent id IS the path key
    agentName: agent.name,
    workspaceName: req.workspaceName,
    requiredIntegrations: [],
  };
}

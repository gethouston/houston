/**
 * Portable agents ("Export a copy" / "From a friend") on the new engine.
 *
 * Export preview + packaging go through the host's v3 portable routes. An
 * uploaded `.houstonagent` is unpacked IN THE BROWSER with the same domain
 * code the host runs (`@houston/domain`), held in memory under a packageId,
 * and installed on confirm as a create-with-seeds (`POST /agents`) — nothing
 * is staged server-side, and the export download is just the route's response
 * bytes (no pod-volume storage on cloud).
 *
 * Pure shape mappings live in `portable-map.ts`.
 */

import {
  filterPackage,
  type PortablePackage,
  packageSeed,
  scanContent,
  unpackAgent,
} from "@houston/domain";
import type {
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import {
  type ControlPlaneConfig,
  createAgent,
  gatewayAuthFetch,
} from "./control-plane";
import { packagePreview, toWireSelection } from "./portable-map";

/** Unpacked uploads awaiting install, keyed by the packageId handed to the wizard. */
const uploads = new Map<string, PortablePackage>();

async function hostFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  // gatewayAuthFetch: live bearer per attempt + 401 refresh/replay (HOU-687).
  // Carry the active-space selector (C8) so a team-space agent's portable
  // routes resolve in the team namespace, not the caller's personal org.
  const res = await gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug)(
    `${cfg.baseUrl}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    },
  );
  if (!res.ok) {
    throw new HoustonEngineError(
      res.status,
      await res.json().catch(() => ({})),
    );
  }
  return res;
}

/** The agent's exportable content, for the "Export a copy" pick screen. */
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
    {
      method: "POST",
      body: JSON.stringify({
        selection: toWireSelection(req.selection),
        overrides: req.overrides,
        meta: { anonymized: req.meta.anonymized },
      }),
    },
  );
  return await res.arrayBuffer();
}

/** Run the host's heuristic redactor over the selected agent content. */
export async function anonymize(
  cfg: ControlPlaneConfig,
  agentId: string,
  req: PortableAnonymizeRequest,
): Promise<PortableAnonymizeResponse> {
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/portable/anonymize`,
    { method: "POST", body: JSON.stringify(req) },
  );
  return (await res.json()) as PortableAnonymizeResponse;
}

/**
 * Unpack an uploaded `.houstonagent` locally and park it until the user
 * confirms the install. Throws the domain's own message on junk bytes /
 * future formats — the wizard toasts it verbatim.
 */
export function previewUpload(
  bytes: ArrayBuffer | Uint8Array,
): PortableUploadPreviewResponse {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pkg = unpackAgent(u8);
  const packageId = crypto.randomUUID();
  uploads.set(packageId, pkg);
  return { packageId, ...packagePreview(pkg) };
}

/**
 * The heuristic threat scan over a parked upload. Runs entirely in the
 * browser — the package is already unpacked here, and the scan is the same
 * pure `@houston/domain` code the host would run.
 */
export function scanUpload(packageId: string): PortableScanResponse {
  const pkg = uploads.get(packageId);
  if (!pkg) {
    throw new Error(
      "The uploaded agent file is no longer available — pick the file again.",
    );
  }
  return scanContent(pkg);
}

/**
 * Install the parked archive as a new agent — as an ordinary agent create
 * carrying the selected content as its seed payload (CLAUDE.md + file map).
 * That pipeline exists on BOTH backends: the local host writes the seeds on
 * create, and the hosted-cloud gateway (which serves no account-level
 * portable route) persists them and seeds the new agent's pod with them.
 */
export async function install(
  cfg: ControlPlaneConfig,
  req: PortableInstallRequest,
): Promise<PortableInstalledAgent> {
  const parked = uploads.get(req.packageId);
  if (!parked) {
    throw new Error(
      "The uploaded agent file is no longer available — pick the file again.",
    );
  }
  const pkg = filterPackage(parked, toWireSelection(req.selection));
  const agent = await createAgent(
    cfg,
    req.agentName,
    req.agentColor ?? undefined,
    packageSeed(pkg),
  );
  uploads.delete(req.packageId);
  return {
    agentPath: agent.id, // in control-plane mode the agent id IS the path key
    agentName: agent.name,
    workspaceName: req.workspaceName,
    requiredIntegrations: [],
    agent,
  };
}

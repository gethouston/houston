import {
  type PortablePackage,
  scanContent,
  unpackAgent,
} from "@houston/domain";
import type {
  PortableExportRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
} from "@houston/wire-types";
import { HoustonEngineError } from "./client/errors";
import { type ControlPlaneConfig, gatewayAuthFetch } from "./control-plane";
import { packagePreview, toWireSelection } from "./portable-map";

const uploads = new Map<string, PortablePackage>();

export function parkUpload(
  pkg: PortablePackage,
): PortableUploadPreviewResponse {
  const packageId = crypto.randomUUID();
  uploads.set(packageId, pkg);
  return { packageId, ...packagePreview(pkg) };
}

export async function hostFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
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
        meta: { anonymized: req.meta.anonymized },
      }),
    },
  );
  return await res.arrayBuffer();
}

export function previewUpload(
  bytes: ArrayBuffer | Uint8Array,
): PortableUploadPreviewResponse {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return parkUpload(unpackAgent(u8));
}

export function scanUpload(packageId: string): PortableScanResponse {
  return scanContent(parkedUpload(packageId));
}

export function parkedUpload(packageId: string): PortablePackage {
  const pkg = uploads.get(packageId);
  if (!pkg) {
    throw new Error(
      "The uploaded agent file is no longer available — pick the file again.",
    );
  }
  return pkg;
}

export function dropUpload(packageId: string): void {
  uploads.delete(packageId);
}

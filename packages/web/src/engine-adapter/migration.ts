/**
 * The agent-scoped migration routes on the new engine: the export/import pair
 * the desktop→cloud migration uses, reachable for any agent the caller manages
 * ("Copy an agent" moves the source's chats through it). Same transport as the
 * portable routes (`hostFetch`: live bearer + 401 replay + active space pin).
 */

import type {
  MigrationImportOptions,
  MigrationImportResult,
} from "../../../../ui/engine-client/src/types";
import type { ControlPlaneConfig } from "./control-plane";
import { hostFetch } from "./portable";

/** Zip the requested in-scope paths of one agent (the migration export route). */
export async function migrationExport(
  cfg: ControlPlaneConfig,
  agentId: string,
  paths: string[],
): Promise<ArrayBuffer> {
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/migration/export`,
    { method: "POST", body: JSON.stringify({ paths }) },
  );
  return await res.arrayBuffer();
}

/** Unpack one zip chunk into an agent (the migration import route). */
export async function migrationImport(
  cfg: ControlPlaneConfig,
  agentId: string,
  bytes: ArrayBuffer,
  opts?: MigrationImportOptions,
): Promise<MigrationImportResult> {
  const q = new URLSearchParams();
  if (opts?.overwrite) q.set("overwrite", "1");
  if (opts?.sessions === false) q.set("sessions", "0");
  const query = q.size ? `?${q.toString()}` : "";
  const res = await hostFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/migration/import${query}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: bytes,
    },
  );
  return (await res.json()) as MigrationImportResult;
}

/**
 * The agent-scoped migration requests — zip a set of one agent's files out,
 * unpack that zip into another, then stamp and read back the marker that says
 * the transfer finished — over the injected `fetch`.
 *
 * All four are HOST routes (`packages/host/src/routes/migration.ts`), and on cloud
 * the gateway proxies them to the agent's pod, so the pair moves an agent's
 * data between any two Houston deployments the caller can reach. "Copy an
 * agent" runs both halves against the same engine; the desktop-to-cloud wizard
 * runs the export half against a passive source host it spawned over the old
 * tree, which is its own peer rather than this scope's base.
 *
 * SEAM — gateway control routes ABOUT an agent, not calls into its sandbox, so
 * they run on the module's own {@link moduleScope} rooted at the base URL and
 * never `clientFor(agentId)`.
 *
 * NOTHING here degrades: a missing route, a refused agent and a corrupt archive
 * are three different answers, and a copy that quietly wrote nothing would read
 * to the user as a copy that worked. Every failure throws a
 * `MigrationHttpError` carrying the HTTP `status`.
 */

import { type HttpScope, httpRequest } from "../http";
import type {
  MigrationCounts,
  MigrationImportOptions,
  MigrationImportResult,
  MigrationMarker,
  MigrationSource,
} from "./types";

/**
 * Copies a chosen set of an agent's files out as one archive.
 *
 * Zip the requested in-scope paths of one agent (the migration export route).
 * @assistant group:files hidden: answers with a zip as raw bytes, which no chat turn can carry; the copy and migration flows drive it themselves.
 * @assistant hands: unreachable the copy and migration wizards drive it themselves; no screen offers it as an errand, and the Files screen only uploads and downloads.
 */
export async function migrationExport(
  scope: HttpScope,
  agentId: string,
  paths: string[],
): Promise<ArrayBuffer> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/migration/export`,
    { method: "POST", body: JSON.stringify({ paths }) },
  );
  return await res.arrayBuffer();
}

/**
 * Unpacks one archive of another agent's files into an agent.
 *
 * Unpack one zip chunk into an agent (the migration import route).
 * @assistant group:files hidden: takes a zip as raw bytes, which no chat turn can carry; the copy and migration flows drive it themselves.
 * @assistant hands: unreachable the copy and migration wizards drive it themselves; no screen offers it as an errand, and the Files screen only uploads and downloads.
 */
export async function migrationImport(
  scope: HttpScope,
  agentId: string,
  bytes: ArrayBuffer,
  opts?: MigrationImportOptions,
): Promise<MigrationImportResult> {
  const q = new URLSearchParams();
  if (opts?.overwrite) q.set("overwrite", "1");
  if (opts?.sessions === false) q.set("sessions", "0");
  const query = q.size ? `?${q.toString()}` : "";
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/migration/import${query}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: bytes,
    },
  );
  return (await res.json()) as MigrationImportResult;
}

/**
 * Records that an agent's data finished arriving from somewhere else.
 *
 * Write the import marker on an agent (the migration complete route).
 * @assistant group:files hidden: the migration wizard stamps and reads this marker itself; it is bookkeeping about a transfer, not an errand a chat turn can run.
 * @assistant hands: unreachable the copy and migration wizards drive it themselves; no screen offers it as an errand.
 */
export async function migrationComplete(
  scope: HttpScope,
  agentId: string,
  source: MigrationSource,
  counts: MigrationCounts,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/migration/complete`,
    { method: "POST", body: JSON.stringify({ source, counts }) },
  );
}

/**
 * Says whether an agent's data was imported from somewhere else, and from where.
 *
 * Read the import marker of an agent (the migration status route).
 * @assistant group:files hidden: the migration wizard stamps and reads this marker itself; it is bookkeeping about a transfer, not an errand a chat turn can run.
 * @assistant hands: unreachable the copy and migration wizards drive it themselves; no screen offers it as an errand.
 */
export async function migrationStatus(
  scope: HttpScope,
  agentId: string,
): Promise<MigrationMarker | null> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/migration/status`,
  );
  // `null` here is the SERVER's answer that it holds no marker — a 404 has
  // already thrown, because a deployment that cannot be asked is not the same
  // answer as one that says this agent was never imported.
  return ((await res.json()) as { imported: MigrationMarker | null }).imported;
}

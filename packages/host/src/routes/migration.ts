import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import {
  type StagedUploads,
  StagedUploadUnavailableError,
} from "../uploads/commit";
import { MigrationBodyError, migrationBody } from "../uploads/migration-body";
import { UploadError } from "../uploads/types";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { exportMigrationChunk } from "./migration-export";
import {
  applyMigrationArchive,
  MigrationImportError,
} from "./migration-import";
import { MAX_IMPORT_BODY_BYTES } from "./migration-scope";

/**
 * Agent-scoped routes of the one-click desktop→cloud migration (HOU-719).
 * On the SOURCE (the desktop's briefly-spawned local host) the wizard POSTs
 * `migration/export {paths}` per chunk and streams the zip out. On the TARGET
 * (a cloud pod — the same host image behind the gateway's `/agents/:slug/*`
 * proxy) it POSTs the zip to `migration/import`, then `migration/complete`
 * writes the server-authoritative marker `migration/status` reads back for
 * resume. Returns true when the request was handled.
 */

const MARKER_REL = ".houston/migration/imported.json";

export async function handleMigration(
  deps: {
    vfs?: Vfs;
    uploads?: StagedUploads;
    paths?: WorkspacePaths;
    agentDir?: string;
    /** The verified actor, stamped as imported routines' `created_by`. */
    routineCreatedBy?: string;
  },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  if (!rest.startsWith("migration/")) return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const vfs = deps.vfs;
  const paths = deps.paths ?? new CloudPaths();
  const root = paths.agentRoot(ctx.workspace, ctx.agent);

  if (rest === "migration/export" && method === "POST") {
    const body = await readJson(req);
    const requested = Array.isArray(body.paths) ? body.paths : null;
    if (!requested || requested.some((p: unknown) => typeof p !== "string")) {
      json(res, 400, { error: "missing 'paths' (string array)" });
      return true;
    }
    await exportMigrationChunk(vfs, root, requested as string[], res);
    return true;
  }

  if (rest === "migration/import" && method === "POST") {
    try {
      const body = await migrationBody(
        req,
        MAX_IMPORT_BODY_BYTES,
        deps.uploads,
      );
      if (body === null) {
        json(res, 413, { error: "import body too large" });
        return true;
      }
      const url = new URL(req.url ?? "", "http://local");
      // `sessions=0`: write the transcripts but rebuild no pi session from them.
      // A caller that stamps `needsSessionReplay` on the transcripts instead
      // ("Copy an agent") gets the history replayed into whichever backend the
      // next turn runs on; a synthesized pi session on top would double it.
      const synthesize = url.searchParams.get("sessions") !== "0";
      const { result, events } = await applyMigrationArchive({
        vfs,
        root,
        agentDir: synthesize ? deps.agentDir : undefined,
        bytes: body.bytes,
        overwrite: url.searchParams.get("overwrite") === "1",
        routineCreatedBy: deps.routineCreatedBy,
      });
      await body.staged?.remove();
      for (const type of events) emit?.({ type, agentPath: ctx.agent.id });
      json(res, 200, result);
    } catch (err) {
      if (
        err instanceof UploadError ||
        err instanceof StagedUploadUnavailableError ||
        err instanceof MigrationBodyError
      ) {
        json(res, err.status, {
          error: err.message,
          ...("code" in err ? { code: err.code } : {}),
        });
      } else if (err instanceof MigrationImportError) {
        json(res, err.status, { error: err.message });
      } else {
        json(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return true;
  }

  if (rest === "migration/complete" && method === "POST") {
    const body = await readJson(req);
    await vfs.writeText(
      `${root}/${MARKER_REL}`,
      JSON.stringify({
        completedAt: new Date().toISOString(),
        source: body.source ?? null,
        counts: body.counts ?? null,
      }),
    );
    json(res, 200, { ok: true });
    return true;
  }

  if (rest === "migration/status" && method === "GET") {
    const marker = await vfs.readText(`${root}/${MARKER_REL}`);
    let imported: unknown = null;
    if (marker) {
      try {
        imported = JSON.parse(marker);
      } catch {
        imported = null; // a corrupt marker reads as "not migrated" → safe redo
      }
    }
    json(res, 200, { imported });
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, readJson } from "./http";
import { exportMigrationChunk } from "./migration-export";
import {
  applyMigrationArchive,
  MigrationImportError,
} from "./migration-import";
import { MAX_IMPORT_BODY_BYTES } from "./migration-scope";
import { defineRouteFamily } from "./registry";

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

/** Body reader with a hard cap — a runaway upload dies at the boundary. */
async function readBodyCapped(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > maxBytes) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function handleMigration(
  deps: { vfs?: Vfs; paths?: WorkspacePaths; agentDir?: string },
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
    const bytes = await readBodyCapped(req, MAX_IMPORT_BODY_BYTES);
    if (bytes === null) {
      json(res, 413, { error: "import body too large" });
      return true;
    }
    const url = new URL(req.url ?? "", "http://local");
    // `sessions=0`: write the transcripts but rebuild no pi session from them.
    // A caller that stamps `needsSessionReplay` on the transcripts instead
    // ("Copy an agent") gets the history replayed into whichever backend the
    // next turn runs on; a synthesized pi session on top would double it.
    const synthesize = url.searchParams.get("sessions") !== "0";
    try {
      const { result, events } = await applyMigrationArchive({
        vfs,
        root,
        agentDir: synthesize ? deps.agentDir : undefined,
        bytes,
        overwrite: url.searchParams.get("overwrite") === "1",
      });
      for (const type of events) emit?.({ type, agentPath: ctx.agent.id });
      json(res, 200, result);
    } catch (err) {
      if (err instanceof MigrationImportError) {
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

/**
 * The family owns the whole `migration/` prefix, not only the four pairs it
 * serves: an unknown path or a wrong verb inside it is this handler's own 404,
 * so a migration call that names nothing can never be forwarded to the agent's
 * runtime and answered by something else entirely.
 */
defineRouteFamily({
  group: "migration",
  members: [
    { method: "POST", path: "/agents/:agentId/migration/export" },
    { method: "POST", path: "/agents/:agentId/migration/import" },
    { method: "POST", path: "/agents/:agentId/migration/complete" },
    { method: "GET", path: "/agents/:agentId/migration/status" },
  ],
  // `/agents/:agentId/migration` alone is NOT in the prefix (the check above
  // requires the separator), so it falls through to the agent's runtime.
  owns: ["/agents/:agentId/migration/", "/agents/:agentId/migration/*rest"],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/migration.ts",
  handler: async ({ deps, authz, method, path, req, res, emit }) => {
    await handleMigration(
      {
        vfs: deps.vfs,
        paths: deps.paths ?? DEFAULT_PATHS,
        // Anchors re-synthesized pi sessions on a deployment with a real
        // on-disk tree; absent in cloud, where nothing replays them.
        agentDir: deps.agentDir?.(authz.workspace, authz.agent),
      },
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    );
  },
});

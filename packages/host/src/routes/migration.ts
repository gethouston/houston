import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { type Zippable, zipSync } from "fflate";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import { MAX_ARCHIVE_BYTES } from "../turn/files-archive";
import type { Vfs } from "../vfs";
import { safeSeedKey } from "./agent-seed";
import { json, readJson } from "./http";
import {
  applyMigrationArchive,
  MigrationImportError,
} from "./migration-import";
import {
  classifyMigrationPath,
  MAX_IMPORT_BODY_BYTES,
} from "./migration-scope";

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
    const entries: Zippable = {};
    let total = 0;
    for (const requestedPath of requested as string[]) {
      const rel = safeSeedKey(requestedPath);
      const kind = rel ? classifyMigrationPath(rel) : null;
      if (!rel || kind === null) {
        json(res, 400, {
          error: `path outside migration scope: ${requestedPath}`,
        });
        return true;
      }
      const buf = await vfs.readBytes(`${root}/${rel}`);
      if (buf === null) continue; // deleted since the manifest — not an error
      total += buf.length;
      if (total > MAX_ARCHIVE_BYTES) {
        json(res, 413, { error: "requested chunk too large" });
        return true;
      }
      // Agent data (JSON/markdown) compresses well and is worth the CPU on a
      // one-time upload; working files are often already-compressed binaries.
      entries[rel] = [new Uint8Array(buf), { level: kind === "core" ? 6 : 0 }];
    }
    res.writeHead(200, { "Content-Type": "application/zip" });
    res.end(Buffer.from(zipSync(entries)));
    return true;
  }

  if (rest === "migration/import" && method === "POST") {
    const bytes = await readBodyCapped(req, MAX_IMPORT_BODY_BYTES);
    if (bytes === null) {
      json(res, 413, { error: "import body too large" });
      return true;
    }
    const url = new URL(req.url ?? "", "http://local");
    try {
      const { result, events } = await applyMigrationArchive({
        vfs,
        root,
        agentDir: deps.agentDir,
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

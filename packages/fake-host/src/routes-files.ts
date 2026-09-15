/**
 * `/agents/:id/files*` — the Files tab's workspace surface, mirroring the real
 * host's `turn/files*.ts` routes: list, download, archive (a real zip), import
 * (upload), move, rename, folder create, delete. Backed by `state-workspace.ts`.
 */

import { mimeFor, NAME_TAKEN, READ_ONLY } from "@houston/host/src/turn/files";
import { type Zippable, zipSync } from "fflate";
import { CORS, json, noContent } from "./http";
import * as state from "./state";

/**
 * The real host refuses a taken name rather than overwriting the other entry —
 * same status and same `{error, code}` body, so the UI's expected-state
 * handling is exercised here and not just in production. The code comes from
 * the host's own constant: a drift would make the e2e green while the app
 * showed a red bug toast against the real thing.
 */
const nameTaken = (path: string) =>
  json(
    {
      error: `"${path.split("/").pop() ?? path}" already exists there`,
      code: NAME_TAKEN,
    },
    409,
  );

/**
 * The real host's refusal when the workspace folder answers EACCES/EPERM/EROFS
 * (`turn/files-names.ts` `probeKeyCase`): a read-only mount, revoked folder
 * permissions. Same status and same `{error, code}` body, from the host's own
 * constant, so the app's authored surface is exercised here too.
 */
const readOnly = () =>
  json({ error: "this workspace is read-only", code: READ_ONLY }, 403);

/** The subroutes that WRITE. The collection's own write is its DELETE. */
const WRITE_SUBS: ReadonlySet<string> = new Set([
  "import",
  "move",
  "rename",
  "folder",
]);

function isWrite(method: string, sub: string | undefined): boolean {
  return sub === undefined ? method === "DELETE" : WRITE_SUBS.has(sub);
}

export function handleWorkspaceFiles(
  method: string,
  id: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response {
  const sub = rest[2];
  const query = new URL(req.url).searchParams;

  // The probe the real host runs before any write is the first thing that
  // fails on an unwritable volume, so every write refuses and every read still
  // answers — the asymmetry the Files tab's copy describes.
  if (isWrite(method, sub) && state.isWorkspaceReadOnly(id)) return readOnly();

  if (sub === undefined) {
    if (method === "GET") return json(state.listWorkspaceFiles(id));
    if (method === "DELETE") {
      state.deleteWorkspaceEntry(id, query.get("path") ?? "");
      return json({ ok: true });
    }
    return noContent(405);
  }

  if (sub === "download" && method === "GET") {
    const path = query.get("path") ?? "";
    const f = state.readWorkspaceFile(id, path);
    if (!f) return json({ error: "file not found" }, 404);
    // The REAL host's `mimeFor`, imported rather than re-implemented: the
    // Files tab decides whether a row/card gets a thumbnail by sniffing this
    // header, so a mock that answered octet-stream for everything would have
    // silently made image previews untestable.
    return new Response(new Uint8Array(f.bytes), {
      status: 200,
      headers: { ...CORS, "Content-Type": mimeFor(path) },
    });
  }

  if (sub === "archive" && method === "GET") {
    // No `path` → whole workspace; with `path` → that folder's subtree, with
    // the folder itself as the zip's root entry (like the real host).
    const folder = query.get("path");
    const base = folder ? folder.slice(0, folder.lastIndexOf("/") + 1) : "";
    const files = state
      .listWorkspaceFiles(id)
      .filter(
        (f) => !f.is_directory && (!folder || f.path.startsWith(`${folder}/`)),
      );
    if (files.length === 0) return json({ error: "no files to download" }, 404);
    const entries: Zippable = {};
    for (const f of files) {
      const w = state.readWorkspaceFile(id, f.path);
      if (w) entries[f.path.slice(base.length)] = new Uint8Array(w.bytes);
    }
    return new Response(new Uint8Array(zipSync(entries)), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/zip" },
    });
  }

  if (sub === "import" && method === "POST") {
    const files = (Array.isArray(body?.files) ? body.files : []) as {
      name: string;
      contentBase64: string;
      relPath?: string;
    }[];
    const dir = typeof body?.dir === "string" && body.dir ? body.dir : null;
    return json({ paths: state.importWorkspaceFiles(id, dir, files) });
  }

  if (sub === "move" && method === "POST") {
    const toDir =
      typeof body?.toDir === "string" && body.toDir !== "" ? body.toDir : null;
    const path = String(body?.path ?? "");
    const moved = state.moveWorkspaceEntry(id, path, toDir);
    if (moved.kind === "taken") return nameTaken(path);
    return json({ moved: moved.value });
  }

  if (sub === "rename" && method === "POST") {
    const newName = String(body?.newName ?? "");
    const result = state.renameWorkspaceEntry(
      id,
      String(body?.path ?? ""),
      newName,
    );
    if (result === "taken") return nameTaken(newName);
    return json({ ok: true });
  }

  if (sub === "folder" && method === "POST") {
    const path = String(body?.path ?? "");
    const created = state.createWorkspaceFolder(id, path);
    if (created.kind === "taken") return nameTaken(path);
    return json({ created: created.value });
  }

  return noContent(405);
}

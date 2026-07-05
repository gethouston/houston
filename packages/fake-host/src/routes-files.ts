/**
 * `/agents/:id/files*` — the Files tab's workspace surface, mirroring the real
 * host's `turn/files*.ts` routes: list, download, archive (a real zip), import
 * (upload), move, rename, folder create, delete. Backed by `state-workspace.ts`.
 */

import { type Zippable, zipSync } from "fflate";
import { CORS, json, noContent } from "./http";
import * as state from "./state";

export function handleWorkspaceFiles(
  method: string,
  id: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response {
  const sub = rest[2];
  const query = new URL(req.url).searchParams;

  if (sub === undefined) {
    if (method === "GET") return json(state.listWorkspaceFiles(id));
    if (method === "DELETE") {
      state.deleteWorkspaceEntry(id, query.get("path") ?? "");
      return json({ ok: true });
    }
    return noContent(405);
  }

  if (sub === "download" && method === "GET") {
    const f = state.readWorkspaceFile(id, query.get("path") ?? "");
    if (!f) return json({ error: "file not found" }, 404);
    return new Response(new Uint8Array(f.bytes), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/octet-stream" },
    });
  }

  if (sub === "archive" && method === "GET") {
    const files = state.listWorkspaceFiles(id).filter((f) => !f.is_directory);
    if (files.length === 0) return json({ error: "no files to download" }, 404);
    const entries: Zippable = {};
    for (const f of files) {
      const w = state.readWorkspaceFile(id, f.path);
      if (w) entries[f.path] = new Uint8Array(w.bytes);
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
    }[];
    const dir = typeof body?.dir === "string" && body.dir ? body.dir : null;
    return json({ paths: state.importWorkspaceFiles(id, dir, files) });
  }

  if (sub === "move" && method === "POST") {
    const toDir =
      typeof body?.toDir === "string" && body.toDir !== "" ? body.toDir : null;
    return json({
      moved: state.moveWorkspaceEntry(id, String(body?.path ?? ""), toDir),
    });
  }

  if (sub === "rename" && method === "POST") {
    state.renameWorkspaceEntry(
      id,
      String(body?.path ?? ""),
      String(body?.newName ?? ""),
    );
    return json({ ok: true });
  }

  if (sub === "folder" && method === "POST") {
    return json({
      created: state.createWorkspaceFolder(id, String(body?.path ?? "")),
    });
  }

  return noContent(405);
}

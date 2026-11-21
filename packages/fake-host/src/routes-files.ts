import { mimeFor } from "@houston/host/src/turn/files";
import { NAME_TAKEN, READ_ONLY } from "@houston/protocol";
import { type Zippable, zipSync } from "fflate";
import { CORS, json, noContent } from "./http";
import { fakeOfficePreview } from "./office-preview";
import * as state from "./state";

const nameTaken = (path: string) =>
  json(
    {
      error: `"${path.split("/").pop() ?? path}" already exists there`,
      code: NAME_TAKEN,
    },
    409,
  );

const readOnly = () =>
  json({ error: "this workspace is read-only", code: READ_ONLY }, 403);

const WRITE_SUBS: ReadonlySet<string> = new Set([
  "import",
  "move",
  "rename",
  "folder",
]);

export function isFilesWrite(method: string, sub: string | undefined): boolean {
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

  if (isFilesWrite(method, sub) && state.isWorkspaceReadOnly(id))
    return readOnly();

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
    if (query.get("as") === "pdf")
      return fakeOfficePreview(
        path,
        f.bytes,
        state.getCapabilities().officePreview === true,
      );
    return new Response(new Uint8Array(f.bytes), {
      status: 200,
      headers: { ...CORS, "Content-Type": mimeFor(path) },
    });
  }

  if (sub === "archive" && method === "GET") {
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

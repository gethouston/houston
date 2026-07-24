import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./deps";
import { archiveWorkspace } from "./files-archive";
import {
  importWorkspaceFiles,
  MAX_UPLOAD_BODY_BYTES,
  parseImportBody,
} from "./files-import";
import { moveWorkspaceEntry } from "./files-move";
import {
  createWorkspaceFolder,
  deleteWorkspaceFile,
  extOf,
  FileOpError,
  FilePathError,
  fileKey,
  listWorkspace,
  readWorkspaceFile,
  renameWorkspaceFile,
  safeRel,
} from "./files-ops";

/**
 * Files browser for an agent's workspace — the HOST serves it for EVERY
 * deployment profile (cloud GCS prefix, local real FS) off the shared Vfs, so
 * the web Files tab behaves identically everywhere with no drift. `root` is the
 * agent's workspace root (`WorkspacePaths.agentRoot`): cloud `<prefix>/workspace`,
 * local `<Workspace>/<Agent>`. The agent writes deck.pptx / sheet.xlsx / etc.
 * there during a turn; these endpoints list, read, download, upload, move,
 * rename, delete, create folders, and zip it up for "Download all".
 *
 * Internal Houston state — the top-level `.houston/` (typed data) and `.agents/`
 * (skills) dot-directories — is hidden from the listing and refused by every
 * path op, so the Files tab can neither show nor clobber it.
 *
 * Path safety: every model/UI-supplied relative path is validated to stay inside
 * `root` (no `..`, no absolute, no top-level dot-dir) before it touches storage.
 * The pure operations live in `files-ops.ts` / `files-import.ts` /
 * `files-archive.ts`; this module is the HTTP surface.
 */

// The pure ops are part of this module's public surface (tests, attachments).
export * from "./files-ops";

/** Extension → MIME for the deliverables agents actually produce. */
const MIME: Record<string, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  zip: "application/zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
};
export const mimeFor = (name: string): string =>
  MIME[extOf(name).toLowerCase()] ?? "application/octet-stream";

/** RFC 6266 Content-Disposition with a safe ASCII fallback + UTF-8 filename*. */
export const contentDisposition = (
  kind: "attachment" | "inline",
  name: string,
): string => {
  const ascii = Array.from(name, (c) =>
    c.charCodeAt(0) < 0x7f && c !== '"' && c !== "\\" ? c : "_",
  ).join("");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/**
 * HTTP handler for `files*` routes, intercepted by the host BEFORE the runtime
 * channel (the runtime has no /files route). Returns true when it owns the
 * request (every `files*` path — so a files request is never forwarded to the
 * runtime). A missing vfs 503s; path-safety failures 400. Nothing is swallowed.
 * Every mutation fires `FilesChanged` through `emit` so other clients' Files
 * tabs refresh (the uploader's own tab invalidates on mutation success).
 */
export async function handleFiles(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  if (rest !== "files" && !rest.startsWith("files/")) return false;
  if (!vfs) {
    json(res, 503, { error: "files not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const changed = () =>
    emit?.({ type: "FilesChanged", agentPath: ctx.agent.id });
  try {
    if (method === "GET" && rest === "files") {
      await json(res, 200, await listWorkspace(vfs, root));
      return true;
    }
    if (method === "GET" && rest === "files/download") {
      const rel = safeRel(query.get("path") ?? "");
      const buf = await vfs.readBytes(fileKey(root, rel));
      if (buf === null) {
        json(res, 404, { error: "file not found" });
        return true;
      }
      const name = rel.split("/").pop() ?? "";
      const kind =
        query.get("disposition") === "inline" ? "inline" : "attachment";
      res.writeHead(200, {
        "Content-Type": mimeFor(name),
        "Content-Disposition": contentDisposition(kind, name),
        "Content-Length": buf.length,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return true;
    }
    if (method === "GET" && rest === "files/archive") {
      // No `path` → the whole workspace ("Download all"); with `path` → just
      // that folder's subtree (the folder row's Download).
      const rawFolder = query.get("path");
      const folder = rawFolder ? safeRel(rawFolder) : undefined;
      const zip = await archiveWorkspace(vfs, root, folder);
      const zipName = folder
        ? `${folder.split("/").pop()}.zip`
        : `${ctx.agent.name} files.zip`;
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition("attachment", zipName),
        "Content-Length": zip.length,
        "Cache-Control": "no-store",
      });
      res.end(zip);
      return true;
    }
    if (method === "GET" && rest === "files/read") {
      const got = await readWorkspaceFile(vfs, root, query.get("path") ?? "");
      if (!got) {
        json(res, 404, { error: "file not found" });
        return true;
      }
      await json(res, 200, got);
      return true;
    }
    if (method === "DELETE" && rest === "files") {
      await deleteWorkspaceFile(vfs, root, query.get("path") ?? "");
      changed();
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/import") {
      const { dir, files } = parseImportBody(
        await readJson(req, MAX_UPLOAD_BODY_BYTES),
      );
      const saved = await importWorkspaceFiles(vfs, root, dir, files);
      changed();
      await json(res, 200, { paths: saved });
      return true;
    }
    if (method === "POST" && rest === "files/move") {
      const b = await readJson(req);
      const moved = await moveWorkspaceEntry(
        vfs,
        root,
        String(b.path ?? ""),
        typeof b.toDir === "string" && b.toDir !== "" ? b.toDir : null,
      );
      changed();
      await json(res, 200, { moved });
      return true;
    }
    if (method === "POST" && rest === "files/rename") {
      const b = await readJson(req);
      await renameWorkspaceFile(
        vfs,
        root,
        String(b.path ?? ""),
        String(b.newName ?? ""),
      );
      changed();
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/folder") {
      const b = await readJson(req);
      const created = await createWorkspaceFolder(
        vfs,
        root,
        String(b.path ?? b.folder_name ?? ""),
      );
      changed();
      await json(res, 200, { created });
      return true;
    }
    // A files* path we don't serve — own it with a 404 rather than forward it
    // to the runtime (which has no /files route either).
    json(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    if (err instanceof FilePathError) {
      json(res, 400, { error: err.message });
      return true;
    }
    if (err instanceof FileOpError) {
      json(res, err.status, { error: err.message });
      return true;
    }
    throw err;
  }
}

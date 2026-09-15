import type { ServerResponse } from "node:http";
import type { Vfs } from "../vfs";
import { json } from "./deps";
import { archiveWorkspace } from "./files-archive";
import { contentDisposition, mimeFor } from "./files-mime";
import { logMissingFile } from "./files-missing";
import { fileKey, safeRel, workspaceRel } from "./files-path";

/**
 * The two workspace reads that answer BYTES rather than JSON — one file, or a
 * zip of a folder. They write their own head and body instead of going through
 * `json`, which is why they live apart from the route surface in `files.ts`.
 * Neither is cached: a file the agent rewrites mid-turn must never be served
 * from a stale copy.
 */

/**
 * Serve one workspace file for download (or inline preview). Chat-driven (file
 * cards, prose links), so `workspaceRel`: agents link files by the absolute
 * path of their own working directory.
 */
export async function serveFileDownload(
  vfs: Vfs,
  root: string,
  agentId: string,
  query: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const rel = workspaceRel(root, query.get("path") ?? "");
  const buf = await vfs.readBytes(fileKey(root, rel));
  if (buf === null) {
    await logMissingFile(vfs, root, rel, agentId);
    json(res, 404, { error: "file not found" });
    return;
  }
  const name = rel.split("/").pop() ?? "";
  const kind = query.get("disposition") === "inline" ? "inline" : "attachment";
  res.writeHead(200, {
    "Content-Type": mimeFor(name),
    "Content-Disposition": contentDisposition(kind, name),
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/**
 * Serve a zip of the workspace. No `path` → the whole thing ("Download all");
 * with `path` → just that folder's subtree (the folder row's Download).
 */
export async function serveArchive(
  vfs: Vfs,
  root: string,
  agentName: string,
  query: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const rawFolder = query.get("path");
  const folder = rawFolder ? safeRel(rawFolder) : undefined;
  const zip = await archiveWorkspace(vfs, root, folder);
  const zipName = folder
    ? `${folder.split("/").pop()}.zip`
    : `${agentName} files.zip`;
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": contentDisposition("attachment", zipName),
    "Content-Length": zip.length,
    "Cache-Control": "no-store",
  });
  res.end(zip);
}

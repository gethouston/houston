import type { IncomingMessage, ServerResponse } from "node:http";
import { posix } from "node:path";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./deps";

/**
 * Files browser for an agent's workspace — the HOST serves it for EVERY
 * deployment profile (cloud GCS prefix, local real FS) off the shared Vfs, so
 * the web Files tab behaves identically everywhere with no drift. `root` is the
 * agent's workspace root (`WorkspacePaths.agentRoot`): cloud `<prefix>/workspace`,
 * local `<Workspace>/<Agent>`. The agent writes deck.pptx / sheet.xlsx / etc.
 * there during a turn; these endpoints list, read, download, rename, delete, and
 * create folders against it.
 *
 * Internal Houston state — the top-level `.houston/` (typed data) and `.agents/`
 * (skills) dot-directories — is hidden from the listing and refused by every
 * path op, so the Files tab can neither show nor clobber it.
 *
 * Path safety: every model/UI-supplied relative path is validated to stay inside
 * `root` (no `..`, no absolute, no top-level dot-dir) before it touches storage.
 */

const FOLDER_KEEP = ".keep"; // marker that lets an empty folder show up in a listing

/** The desktop ProjectFile shape the FilesBrowser renders. */
export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
}

export class FilePathError extends Error {
  constructor(rel: string) {
    super(`invalid workspace path: ${rel}`);
    this.name = "FilePathError";
  }
}

/** Normalize a UI-supplied relative path; require it to stay inside the workspace and clear of internal dot-dirs. */
function safeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, "/");
  // Absolute (POSIX or Windows-drive) paths are anomalous — reject, don't silently clamp.
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned))
    throw new FilePathError(rel);
  const norm = posix.normalize(cleaned);
  if (
    norm === "" ||
    norm === "." ||
    norm.startsWith("..") ||
    norm.split("/").includes("..")
  ) {
    throw new FilePathError(rel);
  }
  // Internal Houston state lives in top-level dot-dirs (.houston, .agents). The
  // Files tab must never read or write there.
  if (norm.split("/")[0]?.startsWith(".")) throw new FilePathError(rel);
  return norm;
}

const fileKey = (root: string, rel: string) => `${root}/${rel}`;
const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
};

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
 * List every file under the agent's workspace, plus a synthesized entry for
 * each directory that contains something — so the browser can render folders.
 * The `.keep` markers that back empty folders are hidden but still surface their
 * directory; internal top-level dot-dirs (`.houston`, `.agents`) are hidden whole.
 */
export async function listWorkspace(
  vfs: Vfs,
  root: string,
): Promise<ProjectFile[]> {
  const stats = await vfs.listDetailed(root);
  const files: ProjectFile[] = [];
  const dirs = new Map<string, number>(); // dir path -> latest mtime under it

  for (const s of stats) {
    const rel = s.key.slice(root.length + 1);
    if (!rel) continue;
    const segments = rel.split("/");
    // Hide internal Houston state (top-level .houston / .agents) from the browser.
    if (segments[0]?.startsWith(".")) continue;
    // Record every ancestor directory (with the freshest mtime beneath it).
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      dirs.set(dir, Math.max(dirs.get(dir) ?? 0, s.updatedMs));
    }
    if (segments[segments.length - 1] === FOLDER_KEEP) continue; // hide the marker file itself
    const name = segments[segments.length - 1] ?? "";
    files.push({
      path: rel,
      name,
      extension: extOf(name),
      size: s.size,
      is_directory: false,
      date_modified: s.updatedMs || undefined,
    });
  }

  for (const [dir, mtime] of dirs) {
    const name = dir.split("/").pop() ?? "";
    files.push({
      path: dir,
      name,
      extension: "",
      size: 0,
      is_directory: true,
      date_modified: mtime || undefined,
    });
  }
  return files.sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1; // folders first
    return a.path.localeCompare(b.path);
  });
}

/** Read one workspace file. Text comes back as `content`; binary as base64. */
export async function readWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
): Promise<{ content: string; base64: boolean } | null> {
  const buf = await vfs.readBytes(fileKey(root, safeRel(rel)));
  if (buf === null) return null;
  // Treat a buffer as text only if it round-trips through UTF-8 without
  // replacement chars (so a .pptx comes back as base64 for download, not garbage).
  const text = buf.toString("utf8");
  const isText = !text.includes("�");
  return isText
    ? { content: text, base64: false }
    : { content: buf.toString("base64"), base64: true };
}

export async function deleteWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
): Promise<void> {
  const norm = safeRel(rel);
  const stats = await vfs.listDetailed(fileKey(root, norm));
  if (stats.length > 0) {
    // A directory: delete everything under it.
    for (const s of stats) await vfs.deleteKey(s.key);
  }
  await vfs.deleteKey(fileKey(root, norm));
}

export async function renameWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
  newName: string,
): Promise<void> {
  const from = safeRel(rel);
  if (
    newName.includes("/") ||
    newName.includes("\\") ||
    newName === "" ||
    newName.includes("..") ||
    newName.startsWith(".")
  )
    throw new FilePathError(newName);
  const parent = from.includes("/")
    ? from.slice(0, from.lastIndexOf("/") + 1)
    : "";
  await vfs.move(fileKey(root, from), fileKey(root, `${parent}${newName}`));
}

export async function createWorkspaceFolder(
  vfs: Vfs,
  root: string,
  folder: string,
): Promise<string> {
  const norm = safeRel(folder);
  await vfs.writeText(fileKey(root, `${norm}/${FOLDER_KEEP}`), "");
  return norm;
}

/**
 * HTTP handler for `files*` routes, intercepted by the host BEFORE the runtime
 * channel (the runtime has no /files route). Returns true when it owns the
 * request (every `files*` path — so a files request is never forwarded to the
 * runtime). A missing vfs 503s; path-safety failures 400. Nothing is swallowed.
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
): Promise<boolean> {
  if (rest !== "files" && !rest.startsWith("files/")) return false;
  if (!vfs) {
    json(res, 503, { error: "files not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
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
      await json(res, 200, { ok: true });
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
    throw err;
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { posix } from "node:path";
import { json, readJson, type TurnDeps } from "./deps";

/**
 * Files browser for cloudrun agents. An agent's workspace is the GCS subprefix
 * `<prefix>/workspace/`; the agent writes deck.pptx / sheet.xlsx / etc. there
 * during a turn (the runtime syncs them back). These endpoints let the web
 * Files tab list, read, rename, delete, and create folders against that prefix
 * — the cloud equivalent of the desktop's local-filesystem Files tab.
 *
 * Path safety: every model/UI-supplied relative path is validated to stay
 * inside `<prefix>/workspace/` (no `..`, no absolute) before it touches storage.
 */

const WORKSPACE = "workspace";
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

/** Normalize a UI-supplied relative path and require it to stay inside the workspace. */
function safeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, "/");
  // Absolute (POSIX or Windows-drive) paths are anomalous — reject, don't silently clamp.
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) throw new FilePathError(rel);
  const norm = posix.normalize(cleaned);
  if (norm === "" || norm === "." || norm.startsWith("..") || norm.split("/").includes("..")) {
    throw new FilePathError(rel);
  }
  return norm;
}

const workspaceKey = (prefix: string, rel: string) => `${prefix}/${WORKSPACE}/${rel}`;
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
export const contentDisposition = (kind: "attachment" | "inline", name: string): string => {
  const ascii = Array.from(name, (c) =>
    c.charCodeAt(0) < 0x7f && c !== '"' && c !== "\\" ? c : "_",
  ).join("");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/**
 * List every file under the agent's workspace, plus a synthesized entry for
 * each directory that contains something — so the browser can render folders.
 * The `.keep` markers that back empty folders are hidden but still surface
 * their directory.
 */
export async function listWorkspace(deps: TurnDeps, prefix: string): Promise<ProjectFile[]> {
  const base = `${prefix}/${WORKSPACE}`;
  const stats = await deps.objects.listDetailed(base);
  const files: ProjectFile[] = [];
  const dirs = new Map<string, number>(); // dir path -> latest mtime under it

  for (const s of stats) {
    const rel = s.key.slice(base.length + 1);
    if (!rel) continue;
    const segments = rel.split("/");
    // Record every ancestor directory (with the freshest mtime beneath it).
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      dirs.set(dir, Math.max(dirs.get(dir) ?? 0, s.updatedMs));
    }
    if (segments[segments.length - 1] === FOLDER_KEEP) continue; // hide the marker file itself
    const name = segments[segments.length - 1]!;
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
    const name = dir.split("/").pop()!;
    files.push({ path: dir, name, extension: "", size: 0, is_directory: true, date_modified: mtime || undefined });
  }
  return files.sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1; // folders first
    return a.path.localeCompare(b.path);
  });
}

/** Read one workspace file. Text comes back as `content`; binary as base64. */
export async function readWorkspaceFile(
  deps: TurnDeps,
  prefix: string,
  rel: string,
): Promise<{ content: string; base64: boolean } | null> {
  const buf = await deps.objects.readBytes(workspaceKey(prefix, safeRel(rel)));
  if (buf === null) return null;
  // Treat a buffer as text only if it round-trips through UTF-8 without
  // replacement chars (so a .pptx comes back as base64 for download, not garbage).
  const text = buf.toString("utf8");
  const isText = !text.includes("�");
  return isText
    ? { content: text, base64: false }
    : { content: buf.toString("base64"), base64: true };
}

export async function deleteWorkspaceFile(deps: TurnDeps, prefix: string, rel: string): Promise<void> {
  const norm = safeRel(rel);
  const stats = await deps.objects.listDetailed(`${prefix}/${WORKSPACE}/${norm}`);
  if (stats.length > 0) {
    // A directory: delete everything under it.
    for (const s of stats) await deps.objects.deleteKey(s.key);
  }
  await deps.objects.deleteKey(workspaceKey(prefix, norm));
}

export async function renameWorkspaceFile(
  deps: TurnDeps,
  prefix: string,
  rel: string,
  newName: string,
): Promise<void> {
  const from = safeRel(rel);
  if (newName.includes("/") || newName.includes("\\") || newName === "" || newName.includes(".."))
    throw new FilePathError(newName);
  const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  await deps.objects.move(workspaceKey(prefix, from), workspaceKey(prefix, `${parent}${newName}`));
}

export async function createWorkspaceFolder(deps: TurnDeps, prefix: string, folder: string): Promise<string> {
  const norm = safeRel(folder);
  await deps.objects.writeText(workspaceKey(prefix, `${norm}/${FOLDER_KEEP}`), "");
  return norm;
}

/**
 * HTTP handler for `files*` routes (called from dispatchCloudrun). Returns true
 * when it handled the request. Path-safety failures surface as 400; nothing is
 * swallowed.
 */
export async function handleFileRequest(
  deps: TurnDeps,
  prefix: string,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams,
): Promise<boolean> {
  try {
    if (method === "GET" && rest === "files") {
      await json(res, 200, await listWorkspace(deps, prefix));
      return true;
    }
    if (method === "GET" && rest === "files/download") {
      const rel = safeRel(query.get("path") ?? "");
      const buf = await deps.objects.readBytes(workspaceKey(prefix, rel));
      if (buf === null) return (json(res, 404, { error: "file not found" }), true);
      const name = rel.split("/").pop()!;
      const kind = query.get("disposition") === "inline" ? "inline" : "attachment";
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
      const got = await readWorkspaceFile(deps, prefix, query.get("path") ?? "");
      if (!got) return (json(res, 404, { error: "file not found" }), true);
      await json(res, 200, got);
      return true;
    }
    if (method === "DELETE" && rest === "files") {
      await deleteWorkspaceFile(deps, prefix, query.get("path") ?? "");
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/rename") {
      const b = await readJson(req);
      await renameWorkspaceFile(deps, prefix, String(b.path ?? ""), String(b.newName ?? ""));
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/folder") {
      const b = await readJson(req);
      const created = await createWorkspaceFolder(deps, prefix, String(b.path ?? b.folder_name ?? ""));
      await json(res, 200, { created });
      return true;
    }
    return false;
  } catch (err) {
    if (err instanceof FilePathError) return (json(res, 400, { error: err.message }), true);
    throw err;
  }
}

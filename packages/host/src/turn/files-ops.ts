import { posix } from "node:path";
import type { Vfs } from "../vfs";

/**
 * Pure workspace file operations behind the Files tab — shared by the HTTP
 * handler (`files.ts`), uploads/moves (`files-import.ts`), and the zip download
 * (`files-archive.ts`). Layout-blind: `root` is the agent's workspace root in
 * the vfs (cloud `<prefix>/workspace`, local `<Workspace>/<Agent>`).
 */

export const FOLDER_KEEP = ".keep"; // marker that lets an empty folder show up in a listing

/** The desktop ProjectFile shape the FilesBrowser renders. */
export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
  date_created?: number;
}

export class FilePathError extends Error {
  constructor(rel: string) {
    super(`invalid workspace path: ${rel}`);
    this.name = "FilePathError";
  }
}

/** A file operation that failed with a specific HTTP status (409 conflict, 413 too large, …). */
export class FileOpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FileOpError";
  }
}

/** Normalize a UI-supplied relative path; require it to stay inside the workspace and clear of internal dot-dirs. */
export function safeRel(rel: string): string {
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

export const fileKey = (root: string, rel: string) => `${root}/${rel}`;
export const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
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
  // dir path -> latest mtime / earliest creation under it
  const dirs = new Map<string, { updated: number; created?: number }>();

  for (const s of stats) {
    const rel = s.key.slice(root.length + 1);
    if (!rel) continue;
    const segments = rel.split("/");
    // Hide internal Houston state (top-level .houston / .agents) from the browser.
    if (segments[0]?.startsWith(".")) continue;
    // Record every ancestor directory (freshest mtime, oldest creation beneath it).
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      const cur = dirs.get(dir) ?? { updated: 0 };
      cur.updated = Math.max(cur.updated, s.updatedMs);
      if (s.createdMs !== undefined) {
        cur.created =
          cur.created === undefined
            ? s.createdMs
            : Math.min(cur.created, s.createdMs);
      }
      dirs.set(dir, cur);
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
      date_created: s.createdMs || undefined,
    });
  }

  for (const [dir, meta] of dirs) {
    const name = dir.split("/").pop() ?? "";
    files.push({
      path: dir,
      name,
      extension: "",
      size: 0,
      is_directory: true,
      date_modified: meta.updated || undefined,
      date_created: meta.created || undefined,
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
  const key = fileKey(root, norm);
  const stats = await vfs.listDetailed(key);
  if (stats.length > 0) {
    // A directory: recursive prefix delete — deleting the child keys one by one
    // can't remove the directory node itself on a real filesystem.
    await vfs.deletePrefix(key);
  }
  await vfs.deleteKey(key);
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

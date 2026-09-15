import type { Vfs } from "../vfs";
import { extOf } from "./files-path";

/**
 * The Files tab's listing: every file in the agent's workspace plus the folder
 * rows synthesized from their paths. Split out of `files-ops.ts` (which
 * re-exports it) so the ops module stays about operations.
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

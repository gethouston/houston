/**
 * Client-side move-conflict detection for the Files tab. The listing already
 * holds the whole workspace, so a name collision is known before calling the
 * host's `files/move` (which 409s on clobber) — letting the UI offer
 * Replace / Keep both instead of surfacing an error toast.
 */
import type { FileEntry } from "@houston-ai/agent";

/** Where `sourcePath` would land when moved into `toDir` (null = root). */
export function moveTargetPath(
  sourcePath: string,
  toDir: string | null,
): string {
  const name = sourcePath.split("/").pop() ?? "";
  return toDir ? `${toDir}/${name}` : name;
}

/** True when the listing has `path` itself or anything nested under it. */
function hasEntry(files: readonly FileEntry[], path: string): boolean {
  return files.some((f) => f.path === path || f.path.startsWith(`${path}/`));
}

export type MoveConflict =
  /** Same place (or a folder into itself/descendant): silently do nothing. */
  | { kind: "noop" }
  /** The destination already has an entry with this name. */
  | { kind: "conflict"; targetPath: string; name: string }
  /** Free to move. */
  | { kind: "clear" };

export function detectMoveConflict(
  files: readonly FileEntry[],
  sourcePath: string,
  toDir: string | null,
): MoveConflict {
  if (toDir === sourcePath || toDir?.startsWith(`${sourcePath}/`)) {
    return { kind: "noop" };
  }
  const targetPath = moveTargetPath(sourcePath, toDir);
  if (targetPath === sourcePath) return { kind: "noop" };
  if (hasEntry(files, targetPath)) {
    return {
      kind: "conflict",
      targetPath,
      name: targetPath.split("/").pop() ?? "",
    };
  }
  return { kind: "clear" };
}

/**
 * "Keep both" name: the first `stem (n)[.ext]` free in BOTH the source folder
 * (the item is renamed there first) and the destination folder (it moves next).
 * Mirrors the host's upload dedupe convention.
 */
export function keepBothName(
  files: readonly FileEntry[],
  sourcePath: string,
  toDir: string | null,
): string {
  const name = sourcePath.split("/").pop() ?? "";
  const slash = sourcePath.lastIndexOf("/");
  const sourceDir = slash === -1 ? null : sourcePath.slice(0, slash);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const inDir = (dir: string | null, candidate: string) =>
    hasEntry(files, dir ? `${dir}/${candidate}` : candidate);
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!inDir(sourceDir, candidate) && !inDir(toDir, candidate)) {
      return candidate;
    }
  }
}

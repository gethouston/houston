/**
 * Client-side name-collision detection for the Files section. The listing
 * already holds the whole workspace, so a collision is known before calling the
 * host's `files/move` or `files/rename` (both 409 on clobber): a move offers
 * Replace / Keep both, a rename says the name is taken, and neither costs the
 * user a round trip that could only end in a refusal.
 */

// Subpath import (like @houston/protocol/interaction): the app's node:test
// runner loads value imports for real, and the package index's extensionless
// import chain only resolves under bundler resolution.
import {
  type FileOpCode,
  NAME_TAKEN,
  READ_ONLY,
} from "@houston/protocol/file-refusal";
import type { FileEntry } from "@houston-ai/agent";
import { engineErrorCode } from "./engine-error-code.ts";

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

export type RenameConflict =
  /** The name it already has: silently do nothing. */
  | { kind: "noop" }
  /** A sibling (file OR folder) already carries this name. */
  | { kind: "conflict"; targetPath: string; name: string }
  /** Free to rename. */
  | { kind: "clear" };

/**
 * A rename keeps the item in its folder, so the collision is with a sibling.
 * `hasEntry` counts a folder as taken too, which is exactly right here: one
 * name is one entry, and a file cannot share it with a folder.
 */
export function detectRenameConflict(
  files: readonly FileEntry[],
  sourcePath: string,
  newName: string,
): RenameConflict {
  const slash = sourcePath.lastIndexOf("/");
  const targetPath =
    slash === -1 ? newName : `${sourcePath.slice(0, slash + 1)}${newName}`;
  if (targetPath === sourcePath) return { kind: "noop" };
  if (hasEntry(files, targetPath)) {
    return { kind: "conflict", targetPath, name: newName };
  }
  return { kind: "clear" };
}

/**
 * Which refusal the host answered with, or null for anything else — the ONE
 * place a files-write rejection is classified, so a state the client cannot
 * explain keeps the report path instead of borrowing the nearest authored copy.
 *
 * The vocabulary is the host's own (`@houston/protocol`), not a mirror of it:
 * keying on the code rather than the status is only worth anything while the
 * two ends cannot drift. The English message is no contract either — the
 * host's wording is untranslated and free to change.
 */
export function fileRefusal(err: unknown): FileOpCode | null {
  switch (engineErrorCode(err)) {
    case NAME_TAKEN:
      return NAME_TAKEN;
    case READ_ONLY:
      return READ_ONLY;
    default:
      return null;
  }
}

/** The destination name is in use — another writer, or the agent itself, took
 *  it between the listing the UI read and the request it sent. */
export function isNameTakenError(err: unknown): boolean {
  return fileRefusal(err) === NAME_TAKEN;
}

/** The workspace's storage refuses every write: its folder answered
 *  EACCES/EPERM/EROFS (a read-only mount, a folder whose permissions were
 *  revoked, a sync client holding it). The person's machine, not the data. */
export function isReadOnlyError(err: unknown): boolean {
  return fileRefusal(err) === READ_ONLY;
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

import type { Vfs } from "../vfs";
import { FileOpError, fileKey, safeRel } from "./files-ops";

/**
 * Drag-moves within an agent's workspace — the move half of the Files tab
 * (drag-a-row-onto-a-folder). Same path-safety wall as every other files op
 * (see `files-import.ts` for the upload half).
 */

/**
 * Move a file or folder into `toDir` (null = workspace root), keeping its name.
 * Refuses to clobber an existing target (409) and to move a folder into itself.
 * Returns the new relative path.
 */
export async function moveWorkspaceEntry(
  vfs: Vfs,
  root: string,
  rel: string,
  toDir: string | null,
): Promise<string> {
  const from = safeRel(rel);
  const target = toDir === null ? "" : safeRel(toDir);
  if (target === from || target.startsWith(`${from}/`)) {
    throw new FileOpError(400, "cannot move a folder into itself");
  }
  const name = from.split("/").pop() ?? "";
  const to = target ? `${target}/${name}` : name;
  if (to === from) return from;

  const fromKey = fileKey(root, from);
  const toKey = fileKey(root, to);
  const children = await vfs.listDetailed(fromKey); // non-empty ⇒ a directory
  const existing = new Set((await vfs.listDetailed(root)).map((s) => s.key));
  const targetTaken =
    existing.has(toKey) || [...existing].some((k) => k.startsWith(`${toKey}/`));
  if (targetTaken) {
    throw new FileOpError(409, `"${name}" already exists there`);
  }

  if (children.length > 0) {
    for (const c of children) {
      await vfs.move(c.key, `${toKey}${c.key.slice(fromKey.length)}`);
    }
    // Per-key moves leave the (now empty) source directory tree behind on a
    // real filesystem; sweep it.
    await vfs.deletePrefix(fromKey);
    await vfs.deleteKey(fromKey);
  } else {
    if (!existing.has(fromKey)) throw new FileOpError(404, "file not found");
    await vfs.move(fromKey, toKey);
  }
  return to;
}

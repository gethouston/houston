import { NAME_TAKEN } from "@houston/protocol";
import type { Vfs } from "../vfs";
import {
  FileOpError,
  fileKey,
  loadWorkspaceKeys,
  moveOrRefuse,
  safeRel,
} from "./files-ops";

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
  const existing = await loadWorkspaceKeys(vfs, root);
  // The folder it is already in, spelled differently — nothing to move, and
  // the guard below would read the entry as its own collision.
  if (existing.sameSlot(fromKey, toKey)) return from;
  if (existing.taken(toKey)) {
    throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
  }

  if (children.length > 0) {
    // A folder is moved child by child, so nothing would refuse a destination
    // folder the volume considers the same name (its fold table is its own):
    // the two would silently MERGE. Ask the storage itself before the first
    // child lands.
    if (await vfs.exists(toKey)) {
      throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
    }
    for (const c of children) {
      await moveOrRefuse(
        vfs,
        c.key,
        `${toKey}${c.key.slice(fromKey.length)}`,
        name,
      );
    }
    // Per-key moves leave the (now empty) source directory tree behind on a
    // real filesystem; sweep it.
    await vfs.deletePrefix(fromKey);
    await vfs.deleteKey(fromKey);
  } else {
    if (!existing.has(fromKey)) throw new FileOpError(404, "file not found");
    await moveOrRefuse(vfs, fromKey, toKey, name);
  }
  return to;
}

import { NAME_TAKEN } from "@houston/protocol";
import type { Vfs } from "../vfs";
import {
  FileOpError,
  fileKey,
  loadWorkspaceKeys,
  moveOrRefuse,
  safeRel,
} from "./files-ops";

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
  const children = await vfs.listDetailed(fromKey);
  const existing = await loadWorkspaceKeys(vfs, root);
  if (existing.sameSlot(fromKey, toKey)) return from;
  if (existing.taken(toKey)) {
    throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
  }

  if (children.length > 0) {
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
    await vfs.deletePrefix(fromKey);
    await vfs.deleteKey(fromKey);
  } else {
    if (!existing.has(fromKey)) throw new FileOpError(404, "file not found");
    await moveOrRefuse(vfs, fromKey, toKey, name);
  }
  return to;
}

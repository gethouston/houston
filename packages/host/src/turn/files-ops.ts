import type { Vfs } from "../vfs";
import { FOLDER_KEEP } from "./files-list";
import { loadWorkspaceKeys, moveOrRefuse } from "./files-names";
import {
  FileOpError,
  FilePathError,
  fileKey,
  NAME_TAKEN,
  safeRel,
  workspaceRel,
} from "./files-path";

/**
 * Pure workspace file operations behind the Files tab — shared by the HTTP
 * handler (`files.ts`), uploads/moves (`files-import.ts`), and the zip download
 * (`files-archive.ts`). Layout-blind: `root` is the agent's workspace root in
 * the vfs (cloud `<prefix>/workspace`, local `<Workspace>/<Agent>`).
 */

// Path validation and name comparison are part of this module's public
// surface (handler, move/import ops, tests).
export * from "./files-list";
export * from "./files-names";
export * from "./files-path";

/** Read one workspace file. Text comes back as `content`; binary as base64.
 * Chat-driven, so `workspaceRel`: agents link files by absolute path. */
export async function readWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
): Promise<{ content: string; base64: boolean } | null> {
  const buf = await vfs.readBytes(fileKey(root, workspaceRel(root, rel)));
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

/**
 * Whether a rename actually moved anything. A rename to the name the file
 * already has is a no-op, and announcing a change that never happened makes
 * every other client refetch its Files tab for nothing.
 */
export type RenameOutcome = "renamed" | "unchanged";

export async function renameWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
  newName: string,
): Promise<RenameOutcome> {
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
  const fromKey = fileKey(root, from);
  const toKey = fileKey(root, `${parent}${newName}`);
  if (toKey === fromKey) return "unchanged"; // the name it already has
  // A source that is gone (another tab deleted it, a stale listing) is the
  // user's state, not a server fault: answer 404 like the move op rather than
  // letting the vfs's generic "source not found" surface as a 500.
  const keys = await loadWorkspaceKeys(vfs, root);
  if (!keys.taken(fromKey)) throw new FileOpError(404, "file not found");
  // Same wall the move op puts up: `rename(2)` and an object-store overwrite
  // both replace the destination without a word, so a name the user already
  // uses has to be refused here or their other file is simply gone.
  //
  // Except when the destination is the file's OWN slot: on a case-insensitive
  // disk `readme.md` → `README.md` is a legitimate re-spelling the user asked
  // for, and reading it as a collision would make the rename impossible.
  if (!keys.sameSlot(fromKey, toKey) && keys.taken(toKey)) {
    throw new FileOpError(409, `"${newName}" already exists there`, NAME_TAKEN);
  }
  // The volume gets the last word: its fold table is not `toLowerCase()`'s
  // (APFS resolves `STRASSE.txt` to a stored `straße.txt`) and it may resolve
  // NFC to NFD, so the check above can pass over a real neighbour. A
  // re-spelling of the file ITSELF is the same inode there and still renames.
  await moveOrRefuse(vfs, fromKey, toKey, newName);
  return "renamed";
}

/**
 * Create an empty folder, which exists only through the `.keep` marker under
 * it. A name a FILE already holds is refused rather than attempted: writing
 * `<name>/.keep` beneath a file is ENOTDIR on a real disk, which reached the
 * user as a 500 naming a marker file they never heard of.
 */
export async function createWorkspaceFolder(
  vfs: Vfs,
  root: string,
  folder: string,
): Promise<string> {
  const norm = safeRel(folder);
  const key = fileKey(root, norm);
  const keys = await loadWorkspaceKeys(vfs, root);
  if (keys.taken(key) || (await vfs.exists(key))) {
    const name = norm.split("/").pop() ?? norm;
    throw new FileOpError(409, `"${name}" already exists there`, NAME_TAKEN);
  }
  await vfs.writeText(fileKey(root, `${norm}/${FOLDER_KEEP}`), "");
  return norm;
}

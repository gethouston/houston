import { NAME_TAKEN } from "@houston/protocol";
import type { Vfs } from "../vfs";
import { FOLDER_KEEP } from "./files-list";
import { loadWorkspaceKeys, moveOrRefuse } from "./files-names";
import {
  FileOpError,
  FilePathError,
  fileKey,
  safeRel,
  workspaceRel,
} from "./files-path";

export * from "./files-list";
export * from "./files-names";
export * from "./files-path";

export async function readWorkspaceFile(
  vfs: Vfs,
  root: string,
  rel: string,
): Promise<{ content: string; base64: boolean } | null> {
  const buf = await vfs.readBytes(fileKey(root, workspaceRel(root, rel)));
  if (buf === null) return null;
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
    await vfs.deletePrefix(key);
  }
  await vfs.deleteKey(key);
}

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
  if (toKey === fromKey) return "unchanged";
  const keys = await loadWorkspaceKeys(vfs, root);
  if (!keys.taken(fromKey)) throw new FileOpError(404, "file not found");
  if (!keys.sameSlot(fromKey, toKey) && keys.taken(toKey)) {
    throw new FileOpError(409, `"${newName}" already exists there`, NAME_TAKEN);
  }
  await moveOrRefuse(vfs, fromKey, toKey, newName);
  return "renamed";
}

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

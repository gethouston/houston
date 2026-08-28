import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TurnFilesystem } from "./turn-filesystem";

/** Local bytes and sync bookkeeping restored when a guarded write fails. */
export interface TurnDocumentSnapshot {
  bytes?: Buffer;
  entry?: { hash: string; generation?: string };
  immediate: boolean;
}

/** Capture a document before a mutation or retry attempt. */
export async function snapshotTurnDocument(
  filesystem: TurnFilesystem,
  relativePath: string,
  local: string,
): Promise<TurnDocumentSnapshot> {
  let bytes: Buffer | undefined;
  try {
    bytes = await readFile(local);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const entry = filesystem.manifest.get(relativePath);
  return {
    bytes,
    ...(entry ? { entry: { ...entry } } : {}),
    immediate: filesystem.immediateWrites.has(relativePath),
  };
}

/** Restore a captured document and its sync bookkeeping exactly. */
export async function restoreTurnDocument(
  filesystem: TurnFilesystem,
  relativePath: string,
  local: string,
  snapshot: TurnDocumentSnapshot,
): Promise<void> {
  if (snapshot.bytes) {
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, snapshot.bytes);
  } else {
    await rm(local, { force: true });
  }
  if (snapshot.entry) filesystem.manifest.set(relativePath, snapshot.entry);
  else filesystem.manifest.delete(relativePath);
  if (snapshot.immediate) filesystem.immediateWrites.add(relativePath);
  else filesystem.immediateWrites.delete(relativePath);
}

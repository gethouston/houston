import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { atomicTempPath } from "@houston/protocol";
import { mergeDocumentBodies, mergeOverDeleted } from "./sync-back-doc-merge";
import type { RemoteDocument } from "./sync-back-remote-read";

export interface MergeOutcome {
  body: string;
  unmergeable?: string;
}

export function mergeOrOverwrite(
  relativePath: string,
  local: string,
  remote: RemoteDocument,
  base: string | undefined,
): MergeOutcome {
  try {
    if (remote.body === undefined) {
      return { body: mergeOverDeleted(relativePath, local, base) ?? local };
    }
    return {
      body:
        mergeDocumentBodies(relativePath, local, remote.body, base) ?? local,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[sync-back] ${relativePath} unmergeable, local bytes overwrite the remote: ${reason}`,
    );
    return { body: local, unmergeable: reason };
  }
}

export async function writeAtomically(abs: string, body: string) {
  const staged = await stageReplacement(abs, body);
  try {
    await staged.commit();
  } finally {
    await staged.discard();
  }
}

export async function stageReplacement(abs: string, body: string) {
  const temp = atomicTempPath(abs, randomUUID());
  try {
    await writeFile(temp, body);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  let committed = false;
  return {
    commit: async () => {
      await rename(temp, abs);
      committed = true;
    },
    discard: async () => {
      if (!committed) await rm(temp, { force: true });
    },
  };
}

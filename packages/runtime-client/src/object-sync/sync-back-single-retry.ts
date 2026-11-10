import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { atomicTempPath } from "@houston/protocol";
import { fileSha256 } from "./file-hash";
import type { HydrateManifestEntry } from "./hydrate";
import {
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "./object-store";
import { mergesOnceOnConflict } from "./sync-back-doc-merge";
import { type RefreshManifest, sourceVanished } from "./sync-back-merge-retry";
import { mergeOrOverwrite, stageReplacement } from "./sync-back-merge-write";
import type { LocalWriteLock } from "./sync-back-types";

/**
 * The standing store sync's generation-conflict retry, unchanged from before
 * the per-turn worker's merge rounds (`sync-back-merge-retry.ts`): refresh the
 * listing, merge routines/learnings/run history/custom integrations into the
 * remote once (the board is never merged here: it re-uploads, last writer
 * wins), and upload once at the refreshed generation. A second conflict, or a
 * local write that landed during the merge, is recorded for the next pass.
 */
export async function retryAtRefreshedGeneration(
  opts: {
    store: ObjectStore;
    abs: string;
    key: string;
    relativePath: string;
    hash: string;
    previous?: HydrateManifestEntry;
    refresh: RefreshManifest;
    localWriteLock?: LocalWriteLock;
  },
  conflict: string,
): Promise<{
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  conflict?: string;
  vanished?: boolean;
}> {
  const current = await opts.refresh(opts.key);
  if (current === undefined)
    return { entry: opts.previous, uploaded: false, conflict };
  const retryGeneration = current ? current.generation : "0";
  if (retryGeneration === undefined) {
    return { entry: opts.previous, uploaded: false, conflict };
  }
  try {
    const mergedHash = await mergeSyncBackDocument(opts, retryGeneration);
    if (mergedHash === CHANGED_LOCALLY) {
      const conflict = `${opts.relativePath} changed locally during its merge`;
      return { entry: opts.previous, uploaded: false, conflict };
    }
    const result = await opts.store.upload(opts.abs, opts.key, {
      ifGenerationMatch: retryGeneration,
    });
    return {
      entry: { hash: mergedHash ?? opts.hash, generation: result?.generation },
      uploaded: true,
    };
  } catch (retryError) {
    if (sourceVanished(retryError)) return { uploaded: false, vanished: true };
    if (!(retryError instanceof StoreConflictError)) throw retryError;
    return {
      entry: opts.previous
        ? { ...opts.previous, generation: retryGeneration }
        : undefined,
      uploaded: false,
      conflict: retryError.message,
    };
  }
}

const CHANGED_LOCALLY = Symbol("changed locally");

const unlocked: LocalWriteLock = (_relativePath, write) => write();

/**
 * Merge a conflict-sensitive document and replace its local copy, unless the
 * pod's host rewrote it while the remote was read: the merge would drop that
 * write (a run the host just fired), so it waits for the next pass. The
 * compare and the replace hold the host's lock on the file when given one.
 * A remote that is gone, or a side that will not parse, has nothing to merge:
 * the local bytes upload as they are, never throwing out of the whole pass
 * (every later file would stay un-synced, pass after pass).
 */
async function mergeSyncBackDocument(
  opts: {
    store: ObjectStore;
    abs: string;
    key: string;
    relativePath: string;
    localWriteLock?: LocalWriteLock;
  },
  generation: string,
): Promise<string | typeof CHANGED_LOCALLY | undefined> {
  if (!mergesOnceOnConflict(opts.relativePath)) return undefined;
  const localBody = await readFile(opts.abs, "utf8");
  const remoteTemp = atomicTempPath(opts.abs, `${randomUUID()}.remote`);
  try {
    try {
      await opts.store.download(opts.key, remoteTemp);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return undefined;
      throw error;
    }
    const remote = { body: await readFile(remoteTemp, "utf8"), generation };
    const outcome = mergeOrOverwrite(
      opts.relativePath,
      localBody,
      remote,
      undefined,
    );
    if (outcome.unmergeable) return undefined;
    const merged = outcome.body;
    const staged = await stageReplacement(opts.abs, merged);
    try {
      const lock = opts.localWriteLock ?? unlocked;
      const replaced = await lock(opts.relativePath, async () => {
        if ((await readFile(opts.abs, "utf8")) !== localBody) return false;
        await staged.commit();
        return true;
      });
      if (!replaced) return CHANGED_LOCALLY;
    } finally {
      await staged.discard();
    }
    const { size } = await stat(opts.abs);
    return fileSha256(opts.abs, size);
  } finally {
    await rm(remoteTemp, { force: true });
  }
}

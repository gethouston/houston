import type { HydrateManifestEntry } from "./hydrate";
import {
  type ObjectStore,
  ObjectTooLargeError,
  ObjectWriteRefusedError,
  StoreConflictError,
  type WriteOptions,
} from "./object-store";
import { keepRemoteBesideLocal } from "./sync-back-conflict-copy";
import { isMergedDocument } from "./sync-back-doc-merge";
import { withMergeBase } from "./sync-back-merge-base";
import {
  type ConflictBackoff,
  type RefreshManifest,
  sourceVanished,
  uploadMergedDocument,
} from "./sync-back-merge-retry";
import { retryAtRefreshedGeneration } from "./sync-back-single-retry";
import type { ConflictCopy, LocalWriteLock } from "./sync-back-types";

export type { RefreshManifest } from "./sync-back-merge-retry";

export interface UploadChangeResult {
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  skipped?: string;
  refused?: boolean;
  conflict?: string;
  vanished?: boolean;
  mergeAttempts?: number;
  removedCards?: string[];
  unmergeable?: string;
  conflictCopy?: ConflictCopy;
}

function initialWriteOptions(
  generationAware: boolean,
  previous: HydrateManifestEntry | undefined,
): WriteOptions | undefined {
  if (!generationAware) return undefined;
  if (previous?.generation !== undefined) {
    return { ifGenerationMatch: previous.generation };
  }
  return previous ? undefined : { ifGenerationMatch: "0" };
}

export async function uploadChangedObject(opts: {
  store: ObjectStore;
  abs: string;
  key: string;
  relativePath: string;
  hash: string;
  previous?: HydrateManifestEntry;
  generationAware: boolean;
  refresh: RefreshManifest;
  workerMerge?: boolean;
  conflictCopy?: boolean;
  keptCopy?: ConflictCopy;
  backoff?: ConflictBackoff;
  localWriteLock?: LocalWriteLock;
}): Promise<UploadChangeResult> {
  try {
    const result = await opts.store.upload(
      opts.abs,
      opts.key,
      initialWriteOptions(opts.generationAware, opts.previous),
    );
    const entry = { hash: opts.hash, generation: result?.generation };
    return {
      entry: opts.workerMerge
        ? await withMergeBase(opts.abs, opts.relativePath, entry)
        : entry,
      uploaded: true,
    };
  } catch (error) {
    if (error instanceof ObjectTooLargeError) {
      return {
        entry: { hash: opts.hash },
        uploaded: false,
        skipped: error.message,
        ...(error instanceof ObjectWriteRefusedError ? { refused: true } : {}),
      };
    }
    if (sourceVanished(error)) return { uploaded: false, vanished: true };
    if (!(error instanceof StoreConflictError)) throw error;
    if (opts.workerMerge && isMergedDocument(opts.relativePath)) {
      const { attempts, ...merged } = await uploadMergedDocument({
        ...opts,
        conflict: error.message,
      });
      return { ...merged, mergeAttempts: attempts };
    }
    if (opts.workerMerge && opts.conflictCopy)
      return keepRemoteBesideLocal({ ...opts, conflict: error.message });
    return retryAtRefreshedGeneration(opts, error.message);
  }
}

export interface DeleteObjectResult {
  deleted: boolean;
  entry?: HydrateManifestEntry;
  conflict?: string;
  kept?: boolean;
  refused?: boolean;
}

export async function deleteOwnedObject(opts: {
  store: ObjectStore;
  key: string;
  previous: HydrateManifestEntry;
  generationAware: boolean;
  refresh: RefreshManifest;
}): Promise<DeleteObjectResult> {
  const writeOptions =
    opts.generationAware && opts.previous.generation !== undefined
      ? { ifGenerationMatch: opts.previous.generation }
      : undefined;
  try {
    await opts.store.delete(opts.key, writeOptions);
    return { deleted: true };
  } catch (error) {
    if (error instanceof ObjectWriteRefusedError)
      return {
        deleted: false,
        kept: true,
        refused: true,
        conflict: error.message,
      };
    if (!(error instanceof StoreConflictError)) throw error;
    if ((await opts.refresh(opts.key)) === null) return { deleted: true };
    return { deleted: false, kept: true, conflict: error.message };
  }
}

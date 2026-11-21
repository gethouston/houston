import type { HydrateManifestEntry } from "./hydrate";
import {
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
  type WriteOptions,
} from "./object-store";
import { isMergedDocument } from "./sync-back-doc-merge";
import { withMergeBase } from "./sync-back-merge-base";
import {
  type ConflictBackoff,
  type RefreshManifest,
  sourceVanished,
  uploadMergedDocument,
} from "./sync-back-merge-retry";
import { retryAtRefreshedGeneration } from "./sync-back-single-retry";
import type { LocalWriteLock } from "./sync-back-types";

export type { RefreshManifest } from "./sync-back-merge-retry";

export interface UploadChangeResult {
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  skipped?: string;
  conflict?: string;
  vanished?: boolean;
  mergeAttempts?: number;
  removedCards?: string[];
  unmergeable?: string;
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
    return retryAtRefreshedGeneration(opts, error.message);
  }
}

export interface DeleteObjectResult {
  deleted: boolean;
  entry?: HydrateManifestEntry;
  conflict?: string;
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
    if (!(error instanceof StoreConflictError)) throw error;
    const current = await opts.refresh(opts.key);
    if (current === undefined) {
      return { deleted: false, entry: opts.previous, conflict: error.message };
    }
    if (current === null) return { deleted: true };
    const retryGeneration = current.generation;
    try {
      await opts.store.delete(
        opts.key,
        retryGeneration === undefined
          ? undefined
          : { ifGenerationMatch: retryGeneration },
      );
      return { deleted: true };
    } catch (retryError) {
      if (!(retryError instanceof StoreConflictError)) throw retryError;
      return {
        deleted: false,
        entry: { ...opts.previous, generation: retryGeneration },
        conflict: retryError.message,
      };
    }
  }
}

import type { HydrateManifestEntry } from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import {
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
  type WriteOptions,
} from "./object-store";
import { mergeSyncBackDocument } from "./sync-back-doc-merge";

/** Lazily fetched remote generations shared across one sync pass. */
export type RefreshManifest = () =>
  | Promise<Map<string, ObjectMetadata>>
  | undefined;

/** Result of one upload plus its optional generation retry. */
export interface UploadChangeResult {
  entry?: HydrateManifestEntry;
  uploaded: boolean;
  skipped?: string;
  conflict?: string;
  /** The source file was unlinked between the sync scan and the upload read. */
  vanished?: boolean;
}

/**
 * The agent keeps writing while an upload reads its source, so the file can be
 * unlinked between the scan's hash and the upload's stat/read (runtime session
 * files churn constantly). On the streaming path the errno arrives wrapped as
 * the fetch error's cause.
 */
function sourceVanished(error: unknown): boolean {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
  const cause = (error as { cause?: unknown }).cause;
  return (cause as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
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

/** Upload once, refreshing and retrying one generation conflict. */
export async function uploadChangedObject(opts: {
  store: ObjectStore;
  abs: string;
  key: string;
  relativePath: string;
  hash: string;
  previous?: HydrateManifestEntry;
  generationAware: boolean;
  refresh: RefreshManifest;
}): Promise<UploadChangeResult> {
  try {
    const result = await opts.store.upload(
      opts.abs,
      opts.key,
      initialWriteOptions(opts.generationAware, opts.previous),
    );
    return {
      entry: { hash: opts.hash, generation: result?.generation },
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
    const refreshed = await opts.refresh();
    if (!refreshed) {
      return {
        entry: opts.previous,
        uploaded: false,
        conflict: error.message,
      };
    }
    const current = refreshed.get(opts.key);
    const retryGeneration = current ? current.generation : "0";
    if (retryGeneration === undefined) {
      return {
        entry: opts.previous,
        uploaded: false,
        conflict: error.message,
      };
    }
    try {
      const mergedHash = await mergeSyncBackDocument({
        store: opts.store,
        abs: opts.abs,
        key: opts.key,
        relativePath: opts.relativePath,
      });
      const result = await opts.store.upload(opts.abs, opts.key, {
        ifGenerationMatch: retryGeneration,
      });
      return {
        entry: {
          hash: mergedHash ?? opts.hash,
          generation: result?.generation,
        },
        uploaded: true,
      };
    } catch (retryError) {
      if (sourceVanished(retryError))
        return { uploaded: false, vanished: true };
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
}

/** Result of one delete plus its optional generation retry. */
export interface DeleteObjectResult {
  deleted: boolean;
  entry?: HydrateManifestEntry;
  conflict?: string;
}

/** Delete once, refreshing and retrying one generation conflict. */
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
    const refreshed = await opts.refresh();
    if (!refreshed) {
      return { deleted: false, entry: opts.previous, conflict: error.message };
    }
    const current = refreshed.get(opts.key);
    if (!current) return { deleted: true };
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

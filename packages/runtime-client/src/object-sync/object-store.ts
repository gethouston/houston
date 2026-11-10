export { LocalDirStore } from "./local-dir-store";
export {
  ObjectNotFoundError,
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "./object-store-errors";

/**
 * The object-storage port behind durable engine state. Keys are forward-slash
 * relative paths. Production adapters can live with their owning deployment;
 * LocalDirStore keeps the synchronization contract testable against real files.
 */
export interface ObjectStore {
  /** All keys under a directory prefix, recursively (`object-prefix.ts`). */
  list(prefix: string): Promise<string[]>;
  manifest?(
    prefix?: string,
    opts?: ReadOptions,
  ): Promise<import("./object-manifest").ObjectMetadata[]>;
  /** One level of the directory `prefix` names (`object-manifest.ts`
   *  DirListing). Undefined: the store answered without levels, so the
   *  caller lists recursively instead. */
  manifestDir?(
    prefix?: string,
    opts?: ReadOptions,
  ): Promise<import("./object-manifest").DirListing | undefined>;
  /** `{ refused: true }`: nothing landed (private-paths.ts). */
  download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<ReadResult | void>;
  /** Download one object and return metadata from the same read response. */
  downloadVersioned?(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult>;
  upload(
    srcFile: string,
    key: string,
    opts?: WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<WriteResult | void>;
  delete(key: string, opts?: WriteOptions): Promise<void>;
  /** Read many objects in one round trip. Keys answered `fallback` were not
   *  inlined (too large, or a store without the batch route): read those with
   *  `download`. Written files land atomically, like `download`. */
  downloadMany?(
    entries: BatchReadEntry[],
    opts?: ReadOptions,
  ): Promise<Map<string, BatchReadOutcome>>;
}

export interface BatchReadEntry {
  key: string;
  destFile: string;
}

export type BatchReadOutcome =
  | { status: "ok"; generation?: string }
  | { status: "missing" }
  | { status: "fallback" }
  /** The private directory was refused (private-paths.ts): nothing landed. */
  | { status: "refused" };

export interface ReadOptions {
  signal?: AbortSignal;
  /** The generation the caller already holds: a store that can tell it is
   *  still current skips the body (`notModified`); any other store reads. */
  ifGenerationNotMatch?: string;
}

export interface WriteOptions {
  /** `0` means create-only. */
  ifGenerationMatch?: string;
  /** Abandons the write and its retries (HTTP stores; local stores finish). */
  signal?: AbortSignal;
}

/** Metadata captured atomically with an object download. */
export interface ReadResult {
  generation?: string;
  /** The object is still at `ifGenerationNotMatch`; nothing was written. */
  notModified?: true;
  /** The private directory was refused (private-paths.ts): nothing landed. */
  refused?: true;
}

export interface WriteResult {
  generation?: string;
}

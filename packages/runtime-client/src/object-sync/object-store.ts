import type { UploadStore } from "./upload-store";

export { LocalDirStore } from "./local-dir-store";
export {
  ObjectNotFoundError,
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "./object-store-errors";

export interface ObjectStore extends Partial<UploadStore> {
  list(prefix: string): Promise<string[]>;
  manifest?(
    prefix?: string,
    opts?: ReadOptions,
  ): Promise<import("./object-manifest").ObjectMetadata[]>;
  manifestDir?(
    prefix?: string,
    opts?: ReadOptions,
  ): Promise<import("./object-manifest").DirListing | undefined>;
  download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<ReadResult | void>;
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
  | { status: "refused" };

export interface ReadOptions {
  signal?: AbortSignal;
  ifGenerationNotMatch?: string;
}

export interface WriteOptions {
  ifGenerationMatch?: string;
  signal?: AbortSignal;
}

export interface ReadResult {
  generation?: string;
  notModified?: true;
  refused?: true;
}

export interface WriteResult {
  generation?: string;
}

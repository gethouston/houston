import type {
  HydrateManifest,
  ObjectMetadata,
  ObjectStore,
} from "@houston/runtime-client/object-sync";

/**
 * Manifest hash of a remote key the op wrote or deleted without downloading
 * it. Never equal to a real digest, so a local file under that key is seen as
 * changed and uploaded with the recorded generation as its CAS guard; a key
 * that stays absent locally is deleted under the same guard.
 */
export const UNREAD_HASH = "unread:owned-without-download";

/** One object is over the per-read cap: refused before any byte moves. */
export class LazyObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    readonly size: number,
    readonly maxBytes: number,
  ) {
    super(
      `${key} is ${size} bytes, over the ${maxBytes}-byte cap for a read while the agent sleeps`,
    );
    this.name = "LazyObjectTooLargeError";
  }
}

export interface LazyStoreVfsOptions {
  store: ObjectStore;
  /** Store prefix the vfs keys are relative to (`ws/<org>/<agent>`). */
  prefix: string;
  /** Local overlay directory; vfs keys are paths under it. */
  root: string;
  /** The store's listing under `prefix`, taken once per op. */
  objects: ObjectMetadata[];
  /** Shared with the caller's sync-back: materialized keys + tombstones. */
  manifest: HydrateManifest;
  /** Hydrate-style excludes (auth material, runtime tree): never listed. */
  excludes: string[];
  /** Largest single object a read may materialize. */
  maxObjectBytes: number;
}

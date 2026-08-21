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

/**
 * A read the lazy tree refuses: one object over the per-object cap, or the
 * op's materialized total over its budget. Raised before the bytes move (or
 * right after, when the manifest size turned out stale). The op layer maps
 * it to "unavailable while asleep" for a read and to a decline for a write,
 * never to a partial result.
 */
export class LazyReadRefusedError extends Error {
  constructor(
    readonly reason: "object" | "total",
    readonly key: string,
    readonly size: number,
    readonly maxBytes: number,
  ) {
    super(
      reason === "object"
        ? `${key} is ${size} bytes, over the ${maxBytes}-byte cap for a read while the agent sleeps`
        : `reading ${key} (${size} bytes) would exceed the ${maxBytes}-byte budget of this operation`,
    );
    this.name = "LazyReadRefusedError";
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
  /** Budget for everything this vfs materializes over its lifetime. */
  maxBytes: number;
}

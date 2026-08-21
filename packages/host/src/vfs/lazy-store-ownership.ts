import type {
  HydrateManifest,
  ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import { UNREAD_HASH } from "./lazy-store-types";

/**
 * What the lazy vfs knows about the store's objects and what the op did to
 * them: the remote listing, the keys hidden by a local delete/move, and the
 * sync-back ownership manifest (materialized keys + UNREAD_HASH entries for
 * keys written or deleted without a read).
 */
export class LazyOwnership {
  readonly remote = new Map<string, ObjectMetadata>();
  /** Remote keys deleted (or moved away) locally: hidden from every read. */
  readonly hidden = new Set<string>();

  constructor(private readonly manifest: HydrateManifest) {}

  visible(rel: string): ObjectMetadata | undefined {
    return this.hidden.has(rel) ? undefined : this.remote.get(rel);
  }

  /** Remote keys visible under `prefix/` (not hidden). */
  under(prefix: string): [string, ObjectMetadata][] {
    const within = `${prefix}/`;
    return [...this.remote].filter(
      ([rel]) => rel.startsWith(within) && !this.hidden.has(rel),
    );
  }

  /** A real tree refuses a file where a directory is and vice versa. */
  assertWritable(key: string): void {
    const segments = key.split("/");
    for (let i = 1; i < segments.length; i++) {
      const ancestor = segments.slice(0, i).join("/");
      if (this.visible(ancestor)) {
        throw new Error(`ENOTDIR: not a directory, ${ancestor}`);
      }
    }
    if (this.under(key).length > 0) {
      throw new Error(`EISDIR: illegal operation on a directory, ${key}`);
    }
  }

  /** Put an unread remote key under sync-back ownership (CAS on its generation). */
  own(rel: string): void {
    const meta = this.remote.get(rel);
    if (!meta || this.manifest.has(rel)) return;
    this.manifest.set(rel, {
      hash: UNREAD_HASH,
      ...(meta.generation !== undefined ? { generation: meta.generation } : {}),
    });
  }

  /** Hide a remote key from reads and make sure sync-back deletes it. */
  tombstone(rel: string): void {
    if (!this.remote.has(rel)) return;
    this.hidden.add(rel);
    this.own(rel);
  }

  /** The key was (re)created locally: visible again, owned if remote. */
  written(rel: string): void {
    this.hidden.delete(rel);
    this.own(rel);
  }
}

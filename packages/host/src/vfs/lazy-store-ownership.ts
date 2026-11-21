import {
  excluded,
  type HydrateManifest,
  type ObjectMetadata,
} from "@houston/runtime-client/object-sync";
import { UNREAD_HASH } from "./lazy-store-types";

export class LazyOwnership {
  readonly remote = new Map<string, ObjectMetadata>();
  readonly hidden = new Set<string>();

  constructor(private readonly manifest: HydrateManifest) {}

  ingest(objects: ObjectMetadata[], prefix: string, excludes: string[]): void {
    for (const object of objects) {
      const rel = !prefix
        ? object.key
        : object.key.startsWith(`${prefix}/`)
          ? object.key.slice(prefix.length + 1)
          : null;
      if (!rel || excluded(rel, excludes)) continue;
      this.remote.set(rel, object);
    }
  }

  copied(rel: string, meta: ObjectMetadata): void {
    this.remote.set(rel, meta);
    this.hidden.delete(rel);
    this.manifest.delete(rel);
  }

  visible(rel: string): ObjectMetadata | undefined {
    return this.hidden.has(rel) ? undefined : this.remote.get(rel);
  }

  under(prefix: string): [string, ObjectMetadata][] {
    const within = `${prefix}/`;
    return [...this.remote].filter(
      ([rel]) => rel.startsWith(within) && !this.hidden.has(rel),
    );
  }

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

  own(rel: string): void {
    const meta = this.remote.get(rel);
    if (!meta || this.manifest.has(rel)) return;
    this.manifest.set(rel, {
      hash: UNREAD_HASH,
      ...(meta.generation !== undefined ? { generation: meta.generation } : {}),
    });
  }

  tombstone(rel: string): void {
    if (!this.remote.has(rel)) return;
    this.hidden.add(rel);
    this.own(rel);
  }

  written(rel: string): void {
    this.hidden.delete(rel);
    this.own(rel);
  }
}

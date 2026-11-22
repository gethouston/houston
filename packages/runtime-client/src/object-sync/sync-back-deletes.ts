import { join, posix } from "node:path";
import type { HydrateManifest } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { privateDirOf } from "./private-paths";
import { deleteOwnedObject, type RefreshManifest } from "./sync-back-conflicts";
import type { SyncResult } from "./sync-back-types";

export async function syncDeletes(opts: {
  store: ObjectStore;
  prefix: string;
  dir: string;
  manifest: HydrateManifest;
  nextManifest: HydrateManifest;
  generationAware: boolean;
  refresh: RefreshManifest;
  include: ((relativePath: string) => boolean) | undefined;
  hold: boolean;
  scopeMiss: (relativePath: string) => void;
  conflicts: SyncResult["conflicts"];
  deletesKept: SyncResult["deletesKept"];
}): Promise<string[]> {
  const { manifest, nextManifest } = opts;
  const deleted: string[] = [];
  for (const [rel, previous] of manifest) {
    if (nextManifest.has(rel)) continue;
    if (opts.hold) {
      nextManifest.set(rel, previous);
      continue;
    }
    if (opts.include && !opts.include(rel)) {
      nextManifest.set(rel, previous);
      opts.scopeMiss(rel);
      continue;
    }
    if (privateDirOf(join(opts.dir, ...rel.split("/")))) {
      nextManifest.set(rel, previous);
      continue;
    }
    const key = opts.prefix ? posix.join(opts.prefix, rel) : rel;
    const result = await deleteOwnedObject({
      store: opts.store,
      key,
      previous,
      generationAware: opts.generationAware,
      refresh: opts.refresh,
    });
    if (result.deleted) deleted.push(rel);
    if (result.entry) nextManifest.set(rel, result.entry);
    if (result.kept)
      opts.deletesKept.push({ key: rel, reason: result.conflict ?? "" });
    else if (result.conflict)
      opts.conflicts.push({ key: rel, reason: result.conflict });
  }
  return deleted;
}

import { join, posix } from "node:path";
import { DEFAULT_EXCLUDES, excluded, type HydrateManifest } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { privateDirGate } from "./private-dir-gate";
import { privateDirOf } from "./private-paths";
import { deleteOwnedObject, uploadChangedObject } from "./sync-back-conflicts";
import { keyedRefresh, listingRefresh } from "./sync-back-refresh";
import { SOURCE_GONE, SOURCE_REFUSED, syncSource } from "./sync-back-source";
import type { SyncBackOptions, SyncResult } from "./sync-back-types";
import { walkFiles } from "./sync-back-walk";

export type {
  LocalWriteLock,
  SyncBackOptions,
  SyncMerge,
  SyncResult,
} from "./sync-back-types";

export async function syncBack(
  store: ObjectStore,
  prefix: string,
  dir: string,
  manifest: HydrateManifest,
  opts: SyncBackOptions = {},
): Promise<SyncResult> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  const generationAware =
    opts.generations ??
    [...manifest.values()].some(({ generation }) => generation !== undefined);
  const uploaded: string[] = [];
  const skipped: SyncResult["skipped"] = [];
  const conflicts: SyncResult["conflicts"] = [];
  const merges: SyncResult["merges"] = [];
  const nextManifest: HydrateManifest = new Map();
  let outOfScope = 0;
  const refresh =
    opts.workerMerge && store.downloadVersioned
      ? keyedRefresh(store.downloadVersioned.bind(store), dir)
      : listingRefresh(store, prefix);
  let totalBytes = 0;
  const syncable = privateDirGate();

  for (const rel of await walkFiles(dir, dir)) {
    if (excluded(rel, excludes)) continue;
    const abs = join(dir, ...rel.split("/"));
    if (!(await syncable(abs))) {
      const kept = manifest.get(rel);
      if (kept) nextManifest.set(rel, kept);
      continue;
    }
    const source = await syncSource(abs);
    if (source === SOURCE_GONE) continue;
    if (source === SOURCE_REFUSED) {
      const kept = manifest.get(rel);
      if (kept) nextManifest.set(rel, kept);
      continue;
    }
    try {
      const { hash, size } = source;
      totalBytes += size;
      const previous = manifest.get(rel);
      if (opts.include && !opts.include(rel)) {
        if (previous?.hash !== hash) outOfScope += 1;
        if (previous) nextManifest.set(rel, previous);
        continue;
      }
      if (previous?.hash === hash) {
        nextManifest.set(rel, previous);
        continue;
      }

      const key = prefix ? posix.join(prefix, rel) : rel;
      const result = await uploadChangedObject({
        store,
        abs: source.path,
        key,
        relativePath: rel,
        hash,
        previous,
        generationAware,
        refresh,
        ...(opts.workerMerge ? { workerMerge: true } : {}),
        ...(opts.conflictBackoff ? { backoff: opts.conflictBackoff } : {}),
        ...(opts.localWriteLock ? { localWriteLock: opts.localWriteLock } : {}),
      });
      if (result.mergeAttempts)
        merges.push({
          key: rel,
          attempts: result.mergeAttempts,
          ...(result.removedCards ? { removedCards: result.removedCards } : {}),
          ...(result.unmergeable ? { unmergeable: result.unmergeable } : {}),
        });
      if (result.vanished) {
        totalBytes -= size;
        continue;
      }
      if (result.entry) nextManifest.set(rel, result.entry);
      if (result.uploaded) uploaded.push(rel);
      if (result.skipped) skipped.push({ key: rel, reason: result.skipped });
      if (result.conflict)
        conflicts.push({ key: rel, reason: result.conflict });
    } finally {
      await source.dispose();
    }
  }

  const deleted: string[] = [];
  const holdDeletes =
    opts.holdDeletesOnFailure === true &&
    (skipped.length > 0 || conflicts.length > 0);
  for (const [rel, previous] of manifest) {
    if (nextManifest.has(rel)) continue;
    if (holdDeletes) {
      nextManifest.set(rel, previous);
      continue;
    }
    if (opts.include && !opts.include(rel)) {
      nextManifest.set(rel, previous);
      outOfScope += 1;
      continue;
    }
    if (privateDirOf(join(dir, ...rel.split("/")))) {
      nextManifest.set(rel, previous);
      continue;
    }
    const key = prefix ? posix.join(prefix, rel) : rel;
    const result = await deleteOwnedObject({
      store,
      key,
      previous,
      generationAware,
      refresh,
    });
    if (result.deleted) deleted.push(rel);
    if (result.entry) nextManifest.set(rel, result.entry);
    if (result.conflict) conflicts.push({ key: rel, reason: result.conflict });
  }
  return {
    uploaded,
    deleted,
    skipped,
    conflicts,
    merges,
    outOfScope,
    manifest: nextManifest,
    totalBytes,
  };
}

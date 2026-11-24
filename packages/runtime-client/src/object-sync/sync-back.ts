import { join, posix } from "node:path";
import { DEFAULT_EXCLUDES, excluded, type HydrateManifest } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { privateDirGate } from "./private-dir-gate";
import { uploadChangedObject } from "./sync-back-conflicts";
import { syncDeletes } from "./sync-back-deletes";
import { keyedRefresh, listingRefresh } from "./sync-back-refresh";
import { SOURCE_GONE, SOURCE_REFUSED, syncSource } from "./sync-back-source";
import type { SyncBackOptions, SyncResult } from "./sync-back-types";
import { walkFiles } from "./sync-back-walk";

const isLink = (source: unknown) =>
  typeof source === "object" && source !== null && "link" in source;
const MAX_OUT_OF_SCOPE_KEYS = 100;

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
  const refusedLinks: SyncResult["skipped"] = [];
  const conflicts: SyncResult["conflicts"] = [];
  const merges: SyncResult["merges"] = [];
  const nextManifest: HydrateManifest = new Map();
  let outOfScope = 0;
  const outOfScopeKeys: string[] = [];
  const scopeMiss = (rel: string) => {
    outOfScope += 1;
    if (outOfScopeKeys.length < MAX_OUT_OF_SCOPE_KEYS) outOfScopeKeys.push(rel);
  };
  const conflictCopies: SyncResult["conflictCopies"] = [];
  const deletesKept: SyncResult["deletesKept"] = [];
  const refresh =
    opts.workerMerge && store.downloadVersioned
      ? keyedRefresh(store.downloadVersioned.bind(store), dir)
      : listingRefresh(store, prefix);
  let totalBytes = 0;
  const syncable = privateDirGate();
  const links = store.fileAttrs === true;

  for (const rel of await walkFiles(dir, dir, true)) {
    if (excluded(rel, excludes)) continue;
    const abs = join(dir, ...rel.split("/"));
    if (!(await syncable(abs))) {
      const kept = manifest.get(rel);
      if (kept) nextManifest.set(rel, kept);
      continue;
    }
    if (opts.include && !manifest.has(rel) && !opts.include(rel)) {
      scopeMiss(rel);
      continue;
    }
    const source = await syncSource(abs, rel);
    if (source === SOURCE_GONE) continue;
    const refused = source !== SOURCE_REFUSED && "refusedLink" in source;
    if (source === SOURCE_REFUSED || refused || (!links && isLink(source))) {
      if (refused && links && opts.include?.(rel) !== false)
        refusedLinks.push({
          key: rel,
          reason: source.refusedLink,
          refused: true,
        });
      const kept = manifest.get(rel);
      if (kept) nextManifest.set(rel, kept);
      continue;
    }
    try {
      const { hash, size } = source;
      totalBytes += size;
      const previous = manifest.get(rel);
      if (opts.include && !opts.include(rel)) {
        if (previous?.hash !== hash) scopeMiss(rel);
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
        ...(opts.conflictCopies?.(rel)
          ? { conflictCopy: true, keptCopy: opts.keptCopies?.get(rel) }
          : {}),
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
      if (result.skipped)
        skipped.push({
          key: rel,
          reason: result.skipped,
          ...(result.refused ? { refused: true as const } : {}),
        });
      if (result.conflict)
        conflicts.push({ key: rel, reason: result.conflict });
      if (result.conflictCopy) {
        conflictCopies.push(result.conflictCopy);
        opts.keptCopies?.set(rel, result.conflictCopy);
      }
    } finally {
      await source.dispose();
    }
  }

  const deleted = await syncDeletes({
    store,
    prefix,
    dir,
    manifest,
    nextManifest,
    generationAware,
    refresh,
    include: opts.include,
    hold:
      opts.holdDeletesOnFailure === true &&
      (skipped.length > 0 || conflicts.length > 0),
    scopeMiss,
    conflicts,
    deletesKept,
  });
  return {
    uploaded,
    deleted,
    skipped: [...skipped, ...refusedLinks],
    conflicts,
    merges,
    outOfScope,
    outOfScopeKeys,
    conflictCopies,
    deletesKept,
    manifest: nextManifest,
    totalBytes,
  };
}

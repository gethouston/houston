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

/** Upload changes and conditionally remove objects owned by the prior hydrate. */
export async function syncBack(
  store: ObjectStore,
  prefix: string,
  dir: string,
  manifest: HydrateManifest,
  opts: SyncBackOptions = {},
): Promise<SyncResult> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  // opts.generations is the gateway's explicit capability signal (the boot
  // lease response advertises whether the blob backend supports generation
  // preconditions). It matters exactly where inference cannot work: an empty
  // manifest has no generations to observe, so without the signal a cold
  // agent must write unconditionally and concurrent first creates are
  // last-writer-wins — while sending create-only "0" blindly would 501 on
  // generation-less HTTP backends. Old gateways omit the field; fall back to
  // inferring capability from observed generations.
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
  // The worker's tree is one turn's: it pays a read of the conflicting
  // object rather than a listing of the whole store. The standing sync keeps
  // its one listing per pass.
  const refresh =
    opts.workerMerge && store.downloadVersioned
      ? keyedRefresh(store.downloadVersioned.bind(store), dir)
      : listingRefresh(store, prefix);
  let totalBytes = 0;
  // Sign-in state under a directory the tool user could have planted is
  // neither uploaded nor deleted: its manifest entry stays as it was. A cheap
  // first check only: each file is checked again where it is read.
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
    // The agent keeps writing during a sync pass, so a walked file may vanish
    // before it is read (runtime session files are rewritten constantly). A
    // vanished file is indistinguishable from one deleted before the walk:
    // leave it out of the next manifest and let the delete pass reconcile the
    // store, instead of aborting the whole pass mid-upload. Sign-in state is
    // checked per file and uploaded from a checked copy (sync-back-source.ts).
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
        // Out of the caller's write scope: never uploaded, but still counted
        // toward the next hydration and kept in the manifest as it was.
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
        ...(opts.conflictCopies?.(rel) ? { conflictCopy: true } : {}),
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
      // Second half of the vanish window: the file outlived the hash above
      // but was unlinked before the upload re-read it. Same reconciliation as
      // the walk-stage skip: out of the next manifest, delete pass settles it.
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
      if (result.conflictCopy)
        conflictCopies.push({ key: rel, copy: result.conflictCopy });
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

import {
  type ObjectStore,
  type SyncResult,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { deferredWorkspaceFile } from "./turn-deferred-files";
import { DeferredFilesAbandonedError } from "./turn-deferred-watch";
import type { TurnFilesystem } from "./turn-filesystem";
import { claimedTurnIncludes } from "./turn-filesystem-scope";

function withoutDeferred(
  include: (rel: string) => boolean,
  deferredFailed: boolean,
): (rel: string) => boolean {
  return deferredFailed
    ? (rel) => !deferredWorkspaceFile(rel) && include(rel)
    : include;
}

/** Sync a turn, limiting a claimed writer to its granted turn-owned files. */
export async function syncTurnFilesystem(opts: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  conversationId: string;
  claimed: boolean;
}): Promise<{
  uploaded: string[];
  deleted: string[];
  outOfScope: number;
  skipped: { key: string; reason: string }[];
  conflicts: { key: string; reason: string }[];
  merges: SyncResult["merges"];
  manifest: SyncResult["manifest"];
}> {
  // A deferred upload landing mid-walk would read as a file the turn wrote.
  // One that never landed is in no manifest, so its absence deletes nothing.
  let deferredFailed = false;
  if (opts.filesystem.workspaceReady) {
    try {
      await opts.filesystem.workspaceReady;
    } catch (error) {
      // No tool ran (the gate refused them all, or the prompt ended before
      // any asked), so nothing in the deferred folders is the turn's: one
      // that landed before the stop but never reached the manifest must not
      // read as a new file to upload. The failure itself was reported once.
      deferredFailed = true;
      if (!(error instanceof DeferredFilesAbandonedError))
        console.warn(
          `[turn] syncing without the deferred files conversation=${opts.conversationId}`,
        );
    }
  }
  const result = await syncBack(
    opts.store,
    opts.prefix,
    opts.filesystem.storeRoot,
    opts.filesystem.manifest,
    {
      generations: opts.filesystem.generationAware,
      // The temp tree disappears after one pool turn. If a replacement write
      // fails, keep the durable source object instead of completing its delete.
      holdDeletesOnFailure: opts.claimed,
      // Concurrent turns and the gateway's own card writes share one board:
      // merge it over bounded rounds (the standing daemon never sets this).
      workerMerge: true,
      ...(opts.claimed
        ? {
            include: withoutDeferred(
              claimedTurnIncludes(
                opts.filesystem.dataRel,
                opts.filesystem.workspaceRel,
                opts.conversationId,
              ),
              deferredFailed,
            ),
          }
        : {}),
    },
  );
  if (result.outOfScope > 0) {
    console.info(
      `[turn] pool_writes_out_of_scope=${result.outOfScope} prefix=${opts.prefix || opts.filesystem.dataRel} conversation=${opts.conversationId}`,
    );
  }
  if (result.skipped.length > 0 || result.conflicts.length > 0) {
    console.warn(
      `[turn] pool_sync_incomplete skipped=${result.skipped.length} conflicts=${result.conflicts.length} conversation=${opts.conversationId}`,
    );
  }
  return {
    uploaded: result.uploaded,
    deleted: result.deleted,
    outOfScope: result.outOfScope,
    skipped: result.skipped,
    conflicts: result.conflicts,
    merges: result.merges,
    manifest: result.manifest,
  };
}

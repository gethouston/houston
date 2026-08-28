import {
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import type { TurnFilesystem } from "./turn-filesystem";
import { claimedTurnIncludes } from "./turn-filesystem-scope";

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
}> {
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
      ...(opts.claimed
        ? {
            include: claimedTurnIncludes(
              opts.filesystem.dataRel,
              opts.filesystem.workspaceRel,
              opts.conversationId,
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
  };
}

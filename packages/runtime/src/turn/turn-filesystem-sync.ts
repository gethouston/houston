import {
  type ObjectStore,
  type SyncResult,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { agentScopeIncludes } from "./turn-agent-scope";
import { deferredWorkspaceFile } from "./turn-deferred-files";
import { DeferredFilesAbandonedError } from "./turn-deferred-watch";
import type { TurnFilesystem } from "./turn-filesystem";
import { claimedTurnIncludes } from "./turn-filesystem-scope";

function withoutDeferred(
  include: (rel: string) => boolean,
  deferredFailed: boolean,
  filesystem: TurnFilesystem,
): (rel: string) => boolean {
  const gate = filesystem.deferredGate;
  if (!deferredFailed) return include;
  return gate
    ? (rel) => !gate.unsynced(rel, filesystem.manifest) && include(rel)
    : (rel) => !deferredWorkspaceFile(rel) && include(rel);
}

function narrowed(
  include: (rel: string) => boolean,
  narrow: ((rel: string) => boolean) | undefined,
): (rel: string) => boolean {
  return narrow ? (rel) => narrow(rel) && include(rel) : include;
}

export async function syncTurnFilesystem(opts: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  conversationId: string;
  claimed: boolean;
  narrow?: (rel: string) => boolean;
}): Promise<{
  uploaded: string[];
  deleted: string[];
  outOfScope: number;
  outOfScopeKeys: string[];
  conflictCopies: SyncResult["conflictCopies"];
  deletesKept: SyncResult["deletesKept"];
  skipped: { key: string; reason: string }[];
  conflicts: { key: string; reason: string }[];
  merges: SyncResult["merges"];
  manifest: SyncResult["manifest"];
}> {
  let deferredFailed = false;
  if (opts.filesystem.workspaceReady) {
    try {
      await opts.filesystem.workspaceReady;
    } catch (error) {
      deferredFailed = true;
      if (!(error instanceof DeferredFilesAbandonedError))
        console.warn(
          `[turn] syncing without the deferred files conversation=${opts.conversationId}`,
        );
    }
  }
  const { workspaceRel, dataRel } = opts.filesystem;
  const scope = opts.claimed
    ? claimedTurnIncludes(dataRel, workspaceRel, opts.conversationId)
    : undefined;
  const result = await syncBack(
    opts.store,
    opts.prefix,
    opts.filesystem.storeRoot,
    opts.filesystem.manifest,
    {
      generations: opts.filesystem.generationAware,
      holdDeletesOnFailure: opts.claimed,
      workerMerge: true,
      conflictCopies: (rel) =>
        agentScopeIncludes(rel, workspaceRel) &&
        !rel.startsWith(`${workspaceRel}/.houston/`),
      ...(opts.filesystem.conflictCopies
        ? { keptCopies: opts.filesystem.conflictCopies }
        : {}),
      ...(scope
        ? {
            include: narrowed(
              withoutDeferred(scope, deferredFailed, opts.filesystem),
              opts.narrow,
            ),
          }
        : {}),
    },
  );
  if (result.outOfScope > 0 && !opts.narrow) {
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
    outOfScopeKeys: result.outOfScopeKeys.filter(
      (rel) =>
        scope !== undefined &&
        !scope(rel) &&
        rel.startsWith(`${workspaceRel}/`) &&
        !rel.startsWith(`${dataRel}/`),
    ),
    conflictCopies: result.conflictCopies,
    deletesKept: result.deletesKept,
    skipped: result.skipped,
    conflicts: result.conflicts,
    merges: result.merges,
    manifest: result.manifest,
  };
}

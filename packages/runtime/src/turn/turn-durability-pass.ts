import { StoreFencedError } from "@houston/runtime-client/object-sync";
import { activityDocStale } from "./turn-activity-doc";
import { publishTurnActivityDoc } from "./turn-board-doc";
import { changedEventTypes } from "./turn-changed-events";
import type {
  TurnDurabilityOptions,
  TurnDurabilityResult,
} from "./turn-durability";
import { appendDurabilityError as appendError } from "./turn-durability-error";
import { publishLandedFamilyDocs } from "./turn-family-docs";
import { syncTurnFilesystem } from "./turn-filesystem";
import { reconcileTurnStopMarker } from "./turn-stop-marker";
import { type TurnSyncReport, turnSyncReport } from "./turn-sync-report";
import type { TranscriptPublishResult } from "./turn-transcript";
import { publishTurnViews } from "./turn-view-publish";

/** A fenced worker no longer owns the conversation: nothing it did is done. */
const claimFenced = (
  poolWritesOutOfScope = 0,
  changed: TurnDurabilityResult["changed"] = [],
  sync?: TurnSyncReport,
): TurnDurabilityResult => ({
  outcome: { error: "claim_fenced" },
  poolWritesOutOfScope,
  changed,
  ...(sync ? { sync } : {}),
});

export async function finishTurnDurabilityPass(
  opts: TurnDurabilityOptions,
): Promise<TurnDurabilityResult> {
  await opts.heartbeat?.checkpoint();
  if (opts.heartbeat?.fenced) {
    return claimFenced();
  }

  let synced: Awaited<ReturnType<typeof syncTurnFilesystem>>;
  try {
    // Failed provider work may still have durable tool writes. Only a fence
    // may skip sync because a fenced worker no longer owns this conversation.
    if (opts.timings) opts.timings.t_sync_start = performance.now();
    synced = await syncTurnFilesystem({
      store: opts.resolved.store,
      prefix: opts.resolved.prefix,
      filesystem: opts.filesystem,
      conversationId: opts.turn.conversationId,
      claimed: Boolean(opts.turn.claim),
    });
  } catch (error) {
    // A fenced object write means the claim was adopted mid-sync: report it
    // as exactly that, not as a generic sync failure.
    if (error instanceof StoreFencedError) {
      return claimFenced();
    }
    const message = error instanceof Error ? error.message : String(error);
    const failure = opts.outcome.error
      ? `sync failed: ${message}`
      : `workspace sync failed: ${message}`;
    let outcome = appendError(opts.outcome, failure);
    if (outcome.stopReason) {
      try {
        ({ outcome } = await reconcileTurnStopMarker({ ...opts, outcome }));
      } catch (error) {
        if (error instanceof StoreFencedError) return claimFenced();
        throw error;
      }
    }
    return { outcome, poolWritesOutOfScope: 0, changed: [] };
  }
  if (opts.timings) opts.timings.t_sync_done = performance.now();
  const poolWritesOutOfScope = synced.outOfScope;
  const sync = turnSyncReport(synced, opts.filesystem.workspaceRel);
  let outcome = opts.outcome;
  let transcript = opts.transcript;
  if (outcome.stopReason && sync.incomplete) {
    try {
      const corrected = await reconcileTurnStopMarker(
        { ...opts, outcome },
        synced.manifest,
      );
      outcome = corrected.outcome;
      if (!corrected.localSaved) transcript = null;
    } catch (error) {
      if (error instanceof StoreFencedError)
        return claimFenced(poolWritesOutOfScope, [], sync);
      throw error;
    }
  }
  const afterSyncError = await opts.afterSync?.(synced.uploaded);
  if (afterSyncError) outcome = appendError(outcome, afterSyncError);
  let changed = changedEventTypes(opts.filesystem, [
    ...synced.uploaded,
    ...synced.deleted,
    ...opts.filesystem.immediateWrites,
  ]);

  // Sync objects before publishing rows for history fallback. An unsaved
  // reply still publishes its locally corrected row if object repair failed.
  let published: TranscriptPublishResult | undefined;
  try {
    published = await transcript?.publish();
  } catch (error) {
    published = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (published && "fenced" in published) {
    return claimFenced(poolWritesOutOfScope, changed, sync);
  }
  // An event is a promise that the refetch can be served asleep: a family
  // whose projection failed is left out (the read would fall to the pod).
  const without = (type: (typeof changed)[number]) => {
    changed = changed.filter((t) => t !== type);
  };
  if (published && "error" in published) {
    outcome = appendError(
      outcome,
      `transcript publish failed: ${published.error}`,
    );
    without("ConversationsChanged");
  }
  if (outcome.stopReason && published && !("ok" in published)) {
    try {
      ({ outcome } = await reconcileTurnStopMarker(
        { ...opts, outcome },
        synced.manifest,
      ));
    } catch (error) {
      if (error instanceof StoreFencedError)
        return claimFenced(poolWritesOutOfScope, changed, sync);
      throw error;
    }
  }
  const staleViews = await publishTurnViews({
    deps: opts.deps,
    turn: opts.turn,
    filesystem: opts.filesystem,
    views: opts.views,
    source: opts.resolved,
    landed: [...synced.uploaded, ...synced.deleted],
  });
  for (const type of staleViews) without(type);

  const activityPublished =
    opts.turn.claim && sync.board.landed
      ? await publishTurnActivityDoc(
          opts.deps,
          opts.turn,
          opts.filesystem,
          opts.resolved,
        )
      : null;
  if (activityPublished && "error" in activityPublished) {
    outcome = appendError(
      outcome,
      `board doc publish failed: ${activityPublished.error}`,
    );
  }
  if (activityDocStale(activityPublished)) without("ActivityChanged");
  const familyDocs = await publishLandedFamilyDocs({
    deps: opts.deps,
    turn: opts.turn,
    filesystem: opts.filesystem,
    source: opts.resolved,
    landed: [...synced.uploaded, ...opts.filesystem.immediateWrites],
    deleted: synced.deleted,
  });
  for (const error of familyDocs.errors) outcome = appendError(outcome, error);
  for (const type of familyDocs.stale) without(type);
  // The claim may have been adopted while sync/publish were in flight (the
  // heartbeat loop learns it asynchronously). A last checkpoint keeps a stale
  // worker from ever announcing a clean done.
  await opts.heartbeat?.checkpoint();
  if (opts.heartbeat?.fenced) {
    return claimFenced(poolWritesOutOfScope, changed, sync);
  }
  return {
    outcome,
    poolWritesOutOfScope,
    changed,
    sync,
    ...(published && "disabled" in published
      ? { transcriptSkipped: published.reason }
      : {}),
    ...(activityPublished && "disabled" in activityPublished
      ? { activityDocSkipped: activityPublished.reason }
      : {}),
  };
}

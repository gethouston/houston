import type { SyncResult } from "@houston/runtime-client/object-sync";
import type { OpResult } from "./op-apply";
import {
  archiveConversationKeys,
  repairImportedConversations,
} from "./op-import-repair";
import { type OpClaimTurn, republish } from "./op-republish";
import { opTranscriptMirror } from "./op-transcript";
import { isMigrationImport } from "./op-tree-options";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocSource } from "./turn-activity-source";
import { announcedOpEvents } from "./turn-changed-events";
import type { TurnFilesystem } from "./turn-filesystem";

export class ConversationProjectionError extends Error {}

/**
 * What a sync-back that did not fully land answers instead of the handler's
 * reply, or null when every write is durable. `context` names the op in the
 * log line.
 */
export function partialSyncReply(
  synced: SyncResult,
  context: string,
  durableElsewhere = false,
): Record<string, unknown> | null {
  const landed = synced.uploaded.length + synced.deleted.length > 0;
  const partial =
    synced.outOfScope > 0 ||
    synced.skipped.length > 0 ||
    synced.conflicts.length > 0 ||
    synced.deletesKept.length > 0;
  if (!partial) return null;
  console.error(
    `[op] not durably synced: outOfScope=${synced.outOfScope} skipped=${synced.skipped.length} conflicts=${synced.conflicts.length} deletesKept=${synced.deletesKept.length} landed=${landed} ${context}`,
  );
  // OAuth tokens may already be in remote custody even if no tree file landed.
  if (durableElsewhere) return { ok: true, ambiguous: true };
  // A file the store refuses (over its per-object cap) can never persist
  // anywhere — the pod would silently fail the same way, and proxying would
  // let it answer success for an undurable write. Tell the user; the client
  // does not retry a 413. Checked BEFORE the nothing-landed decline: a
  // single refused file lands nothing.
  if (synced.skipped.length > 0) {
    return {
      ok: true,
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({
        error: "file too large to store",
        files: synced.skipped.map((s) => s.key),
      }),
      events: [],
    };
  }
  // NOTHING landed: declining is safe — the gateway proxies and the pod
  // applies the write from an unchanged tree.
  if (!landed) return { ok: true, decline: true };
  // Something landed and something conflicted: the write is PARTLY durable.
  // Re-running it on the pod would duplicate the part that landed (a routine
  // create mints a fresh id); the client must be told the result is unknown.
  return { ok: true, ambiguous: true };
}

/**
 * Project a durable op: republish its docs (one more round on a failure),
 * mirror a conversation op, repair an import's conversations. Answers the
 * events the reply may announce.
 */
export async function projectDurableOp(input: {
  deps: TurnServerDeps;
  turn: OpClaimTurn;
  op: OpRequest;
  filesystem: TurnFilesystem;
  result: OpResult;
  uploaded: readonly string[];
  deleted: readonly string[];
  /** The op's store, for the docs derived from what landed (skills). */
  source: ActivityDocSource;
  prefix: string;
}): Promise<ReturnType<typeof announcedOpEvents>> {
  const { deps, turn, op, filesystem, result } = input;
  const landed = [...input.uploaded, ...input.deleted];
  const project = () =>
    republish(deps, turn, filesystem, result, landed, input.source);
  let failures = await project();
  if (failures.length > 0) {
    // One more round before accepting a lag: a blip on the doc PUT is the
    // common case and the files are already durable.
    await new Promise((resolve) => setTimeout(resolve, 500));
    failures = await project();
  }
  if (op.op.kind === "conversation") {
    failures.push(...(await opTranscriptMirror(deps, turn, op.op)));
  }
  if (
    op.op.kind === "conversation" &&
    op.op.action !== "rename" &&
    op.op.action !== "delete" &&
    (op.op.action !== "dismiss-interaction" || result.events.length > 0)
  ) {
    failures.push(
      ...(await repairImportedConversations(
        deps,
        turn,
        filesystem,
        [
          `${filesystem.dataRel}/conversations/${encodeURIComponent(op.op.conversationId)}.json`,
        ],
        { requireRoute: true },
      )),
    );
  }
  if (isMigrationImport(op.op)) {
    const carried =
      op.op.kind === "route"
        ? archiveConversationKeys(op.op.bodyBase64, filesystem.workspaceRel)
        : [];
    failures.push(
      ...(await repairImportedConversations(deps, turn, filesystem, [
        ...input.uploaded,
        ...carried,
      ])),
    );
  }
  if (failures.length > 0) {
    // The files ARE durable; only a doc/transcript projection lagged. Never
    // re-run (duplicates) — answer the handler's status and make the gap
    // loud: the next op's republish or the pod's wake-time projector
    // re-projects from the files.
    console.error(
      `[op] projection failed after a durable sync (asleep reads may lag until the next projection): ${failures.join("; ")} prefix=${input.prefix}`,
    );
  }
  if (
    op.op.kind === "conversation" &&
    op.op.action !== "rename" &&
    op.op.action !== "delete" &&
    failures.length > 0
  )
    throw new ConversationProjectionError(
      `conversation projection failed: ${failures.join("; ")}`,
    );
  return announcedOpEvents(result.events, failures);
}

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
  if (durableElsewhere) return { ok: true, ambiguous: true };
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
  if (!landed) return { ok: true, decline: true };
  return { ok: true, ambiguous: true };
}

export async function projectDurableOp(input: {
  deps: TurnServerDeps;
  turn: OpClaimTurn;
  op: OpRequest;
  filesystem: TurnFilesystem;
  result: OpResult;
  uploaded: readonly string[];
  deleted: readonly string[];
  source: ActivityDocSource;
  prefix: string;
}): Promise<ReturnType<typeof announcedOpEvents>> {
  const { deps, turn, op, filesystem, result } = input;
  const landed = [...input.uploaded, ...input.deleted];
  const project = () =>
    republish(deps, turn, filesystem, result, landed, input.source);
  let failures = await project();
  if (failures.length > 0) {
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

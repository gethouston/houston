import { loadRoutineRuns, routineAutoPauseLogTail } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import {
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import { partialSyncReply } from "./op-durability";
import type { ReconcileOp } from "./op-grammar-reconcile";
import { applyReconcileOp } from "./op-reconcile-apply";
import { publishReconcile } from "./op-reconcile-publish";
import type { OpClaimTurn } from "./op-republish";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import { announcedOpEvents } from "./turn-changed-events";
import { claimedTurnIncludes, type TurnFilesystem } from "./turn-filesystem";
import { fsTextStore } from "./turn-fs-store";
import { autoPauseRoutineTurn } from "./turn-routine-auto-pause";

type Reply = { status: number; body: Record<string, unknown> };

export async function executeReconcileOp(input: {
  deps: TurnServerDeps;
  op: OpRequest & { op: ReconcileOp };
  turn: OpClaimTurn;
  resolved: { store: ObjectStore; prefix: string };
  filesystem: TurnFilesystem;
  heartbeat: ReturnType<typeof startClaimHeartbeat>;
}): Promise<Reply> {
  const { filesystem, heartbeat, resolved } = input;
  const applied = await applyReconcileOp(input.op.op, filesystem);
  if (applied.decline) return decline(`${applied.chat}`, resolved.prefix);
  await heartbeat.checkpoint();
  if (heartbeat.fenced) return { status: 409, body: { error: "claim_fenced" } };
  const events: HoustonEvent[] = [...applied.events];
  let landed: string[] = [];
  if (events.length > 0) {
    const synced = await syncBack(
      resolved.store,
      resolved.prefix,
      filesystem.storeRoot,
      filesystem.manifest,
      {
        include: claimedTurnIncludes(
          filesystem.dataRel,
          filesystem.workspaceRel,
          input.turn.conversationId,
        ),
        holdDeletesOnFailure: true,
        generations: filesystem.generationAware,
        workerMerge: true,
      },
    );
    const partial = partialSyncReply(
      synced,
      `prefix=${resolved.prefix} kind=reconcile`,
    );
    if (partial) return decline("sync-back incomplete", resolved.prefix);
    landed = [...synced.uploaded];
  }
  const paused = await pauseAfterSync(input);
  if (paused.failed.length > 0) {
    return decline(
      `auto-pause failed: ${paused.failed.join("; ")}`,
      resolved.prefix,
    );
  }
  events.push(...paused.events);
  const projected = await publishReconcile({
    deps: input.deps,
    turn: input.turn,
    filesystem,
    source: resolved,
    events,
    ...(applied.line ? { line: applied.line } : {}),
    landed,
  });
  if (projected.settle.length > 0) {
    return decline(
      `projection failed: ${projected.settle.join("; ")}`,
      resolved.prefix,
    );
  }
  if (projected.lag.length > 0) {
    console.error(
      `[op] reconcile doc projection lags until the next writer: ${projected.lag.join("; ")} prefix=${resolved.prefix}`,
    );
  }
  return {
    status: 200,
    body: {
      ok: true,
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ chat: applied.chat }),
      events: announcedOpEvents(events, projected.lag),
    },
  };
}

async function pauseAfterSync(input: {
  op: OpRequest & { op: ReconcileOp };
  filesystem: TurnFilesystem;
  resolved: { store: ObjectStore; prefix: string };
}): Promise<{ events: HoustonEvent[]; failed: string[] }> {
  const { items: runs } = await loadRoutineRuns(
    fsTextStore(),
    input.filesystem.workspaceDir,
  );
  const walled = runs.filter(
    (r) =>
      r.session_key === input.op.op.conversationId &&
      r.failure &&
      r.failure.code !== "usage_limit",
  );
  const events: HoustonEvent[] = [];
  const failed: string[] = [];
  for (const routineId of new Set(walled.map((r) => r.routine_id))) {
    try {
      const paused = await autoPauseRoutineTurn({
        store: input.resolved.store,
        prefix: input.resolved.prefix,
        filesystem: input.filesystem,
        routineId,
        nowIso: new Date().toISOString(),
      });
      if (!paused) continue;
      console.info(
        `[routine-auto-pause] paused ${paused.id} after ${routineAutoPauseLogTail(paused.auto_paused)}`,
      );
      events.push({
        type: "RoutinesChanged",
        agentPath: input.filesystem.workspaceRel.replace(/^workspaces\//, ""),
      });
    } catch (error) {
      failed.push(
        `${routineId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { events, failed };
}

function decline(reason: string, prefix: string): Reply {
  console.warn(`[op] reconcile declined: ${reason} prefix=${prefix}`);
  return { status: 200, body: { ok: true, decline: true } };
}

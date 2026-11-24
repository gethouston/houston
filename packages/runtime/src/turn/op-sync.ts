import { syncBack } from "@houston/runtime-client/object-sync";
import { partialSyncReply, projectDurableOp } from "./op-durability";
import type { OpResult } from "./op-result";
import { healRoutinesMirror, staleRoutineWriteId } from "./op-routine-heal";
import type { OpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import type { announcedOpEvents } from "./turn-changed-events";
import type { TurnFilesystem } from "./turn-filesystem";
import type { resolveTurnStore } from "./turn-store";

export async function syncOp(input: {
  deps: TurnServerDeps;
  op: OpRequest;
  filesystem: TurnFilesystem;
  result: OpResult;
  resolved: ReturnType<typeof resolveTurnStore>;
  turnLike: OpRequest & { conversationId: string };
}) {
  const { deps, op, filesystem, result, resolved, turnLike } = input;
  const isRead =
    (op.op.kind === "route" && op.op.method === "GET") ||
    (op.op.kind === "custom-oauth" && op.op.action === "start");
  let announce: ReturnType<typeof announcedOpEvents> = [];
  if (!isRead) {
    const treeOp = op.op.kind === "route" || op.op.kind === "conversation";
    if (
      !result.untouched &&
      (result.tooLarge ||
        result.privateRefused ||
        (treeOp && result.status >= 500))
    ) {
      // A tree-mutating handler failed part-way (a refused lazy read, a
      // 5xx): the overlay may hold HALF a multi-key mutation. Nothing has
      // reached the store yet, so declining is exact — the pod re-runs
      // the write from an unchanged tree instead of the user seeing a
      // split folder. Credential/settings ops have no overlay to leave
      // half-written; their own status (a 502 from the credential store)
      // is the pod's answer too.
      console.error(
        `[op] handler failed before sync: status=${result.status} tooLarge=${result.tooLarge === true} privateRefused=${result.privateRefused === true} prefix=${resolved.prefix} kind=${op.op.kind}`,
      );
      return { reply: { ok: true, decline: true }, announce };
    }
    const synced = await syncBack(
      resolved.store,
      resolved.prefix,
      filesystem.storeRoot,
      filesystem.manifest,
      {
        include: result.include,
        holdDeletesOnFailure: true,
        // A lazy tree's manifest may be EMPTY for a pure create; the
        // listing still told us whether the store mints generations, so a
        // first create stays create-only (CAS "0") instead of blind.
        generations: filesystem.generationAware,
        workerMerge: true,
      },
    );
    const partial = partialSyncReply(
      synced,
      `prefix=${resolved.prefix} kind=${op.op.kind}`,
      result.durableElsewhere,
    );
    if (partial) return { reply: partial, announce };
    if (result.status < 300) {
      announce = await projectDurableOp({
        deps,
        turn: turnLike,
        op,
        filesystem,
        result,
        uploaded: synced.uploaded,
        deleted: synced.deleted,
        source: resolved,
        prefix: resolved.prefix,
      });
    } else {
      const ghost = staleRoutineWriteId(op.op, result);
      if (ghost)
        announce = await healRoutinesMirror(
          deps,
          turnLike,
          resolved,
          filesystem.workspaceRel,
          ghost,
        );
    }
  }
  return { announce, reply: null };
}

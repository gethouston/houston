import { HeartbeatRunStatus } from "@houston/protocol";
import { type HeartbeatDoc, updateHeartbeatDoc } from "./heartbeat";
import type { TextStore } from "./store";

export async function recordHeartbeatAdmitted(
  store: TextStore,
  workspaceId: string,
  run: { date: string; at: string; nonce: string; seen: string[] },
): Promise<void> {
  await updateHeartbeatDoc(store, workspaceId, (current) => ({
    ...current,
    last: {
      status: HeartbeatRunStatus.Delivered,
      date: run.date,
      at: run.at,
    },
    pending: { nonce: run.nonce, at: run.at, seen: run.seen },
  }));
}

export type HeartbeatTurnEnd =
  | { kind: "completed"; nonce: string; at: string }
  | { kind: "failed"; nonce: string; at: string; reason: string };

export function settleHeartbeatRun(
  store: TextStore,
  workspaceId: string,
  end: HeartbeatTurnEnd,
): Promise<HeartbeatDoc | null> {
  return updateHeartbeatDoc(store, workspaceId, (current) => {
    const { pending, last } = current;
    if (pending?.nonce !== end.nonce) return null;
    if (end.kind === "completed")
      return { ...current, pending: null, seen: pending.seen };
    return {
      ...current,
      pending: null,
      last: {
        status: HeartbeatRunStatus.Error,
        date: last?.date ?? end.at.slice(0, 10),
        at: end.at,
        reason: end.reason,
      },
    };
  });
}

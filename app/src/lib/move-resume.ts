import type {
  AgentMoveStart,
  AgentMoveStatus,
} from "@houston-ai/engine-client";
import type { PendingAgentMove } from "./pending-move";
import { MOVE_POLL_TIMEOUT_MS, shareErrorCode } from "./share-via-team.ts";

/**
 * Pure resume algorithm for an abandoned C8 agent move (HOU-817). Wire calls
 * and sleep are injected so every path unit-tests under bare Node.
 *
 * The gateway contract this rests on: a failed/crashed move leaves its durable
 * lock, the locked agent cannot wake (every request 503s "agent is being
 * moved"), and a re-POST of the same move stale-adopts the lock and resumes
 * the relocation. So the ONLY way back to a usable agent is to finish the
 * move: poll the recorded ticket first (the server may still be on it, or may
 * have quietly succeeded), and only re-POST when that ticket reads terminal
 * `failed` (which also covers "move not found" after gateway retention).
 */

export interface MoveWire {
  moveStatus(agentId: string, moveId: string): Promise<AgentMoveStatus>;
  moveAgent(agentId: string, toSlug: string): Promise<AgentMoveStart>;
}

export type ResumeOutcome =
  /** The move reached terminal `done` — the record must be cleared. */
  | { outcome: "done" }
  /** The move reached terminal `failed` again. Keep the record for next boot. */
  | { outcome: "failed"; error?: string; moveId?: string }
  /** A fresh move already owns the agent (another driver). Keep the record. */
  | { outcome: "inProgress" }
  /** The re-POST was rejected (roles/target changed, gateway down). Keep. */
  | { outcome: "rejected"; code?: string }
  /** Still `moving` when the budget ran out. Keep the record. */
  | { outcome: "timeout"; moveId?: string };

export interface ResumeOptions {
  pollIntervalMs?: number;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resume one pending move to a terminal outcome. Never throws. */
export async function resumePendingMove(
  pending: PendingAgentMove,
  wire: MoveWire,
  options: ResumeOptions = {},
): Promise<ResumeOutcome> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const budgetMs = options.budgetMs ?? MOVE_POLL_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + budgetMs;

  // Phase 1: the recorded ticket. `done` means the server finished after the
  // client vanished — nothing to redo. `moving` means it is still running.
  let status: AgentMoveStatus;
  try {
    status = await wire.moveStatus(pending.agentId, pending.moveId);
  } catch (err) {
    return { outcome: "rejected", code: shareErrorCode(err) };
  }
  if (status.status === "moving") {
    const settled = await pollToTerminal(
      pending.agentId,
      pending.moveId,
      wire,
      { pollIntervalMs, deadline, sleep },
    );
    if (settled === null) return { outcome: "timeout" };
    status = settled;
  }
  if (status.status === "done") return { outcome: "done" };

  // Phase 2: terminal `failed` (or an unknown ticket reading as failed) — the
  // lock is still held, so re-POST to stale-adopt and resume the relocation.
  let start: AgentMoveStart;
  try {
    start = await wire.moveAgent(pending.agentId, pending.teamSlug);
  } catch (err) {
    const code = shareErrorCode(err);
    return code === "move_in_progress"
      ? { outcome: "inProgress" }
      : { outcome: "rejected", code };
  }
  const settled = await pollToTerminal(pending.agentId, start.moveId, wire, {
    pollIntervalMs,
    deadline,
    sleep,
  });
  if (settled === null) return { outcome: "timeout", moveId: start.moveId };
  if (settled.status === "done") return { outcome: "done" };
  return { outcome: "failed", error: settled.error, moveId: start.moveId };
}

/** Poll one ticket until `done`/`failed`, or `null` when the deadline passes. */
async function pollToTerminal(
  agentId: string,
  moveId: string,
  wire: MoveWire,
  opts: {
    pollIntervalMs: number;
    deadline: number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<AgentMoveStatus | null> {
  while (Date.now() < opts.deadline) {
    await opts.sleep(opts.pollIntervalMs);
    let status: AgentMoveStatus;
    try {
      status = await wire.moveStatus(agentId, moveId);
    } catch {
      continue; // transient poll blip; the deadline bounds the retries
    }
    if (status.status !== "moving") return status;
  }
  return null;
}

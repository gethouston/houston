import type { AgentMoveStart, AgentMoveStatus } from "@houston/engine-adapter";
import { classifyMoveRePost, type MoveRefusalCode } from "@houston/sdk";
import type { PendingAgentMove } from "./pending-move";
import { shareErrorCode } from "./share-error.ts";
import { MOVE_POLL_TIMEOUT_MS } from "./share-via-team.ts";

export interface MoveWire {
  moveStatus(agentId: string, moveId: string): Promise<AgentMoveStatus>;
  moveAgent(agentId: string, toSlug: string): Promise<AgentMoveStart>;
}

export type ResumeOutcome =
  | { outcome: "done" }
  | { outcome: "gone" }
  | { outcome: "failed"; error?: string; moveId?: string }
  | { outcome: "inProgress" }
  | { outcome: "rejected"; code?: string }
  | { outcome: "refused"; code: MoveRefusalCode }
  | { outcome: "timeout"; moveId?: string };

export interface ResumeOptions {
  pollIntervalMs?: number;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onMoveAccepted?: (moveId: string) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function resumePendingMove(
  pending: PendingAgentMove,
  wire: MoveWire,
  options: ResumeOptions = {},
): Promise<ResumeOutcome> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const budgetMs = options.budgetMs ?? MOVE_POLL_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + budgetMs;

  let status: AgentMoveStatus = { status: "failed", error: "move not found" };
  if (pending.moveId) {
    try {
      status = await wire.moveStatus(pending.agentId, pending.moveId);
    } catch (err) {
      return { outcome: "rejected", code: shareErrorCode(err) };
    }
  }
  if (pending.moveId && status.status === "moving") {
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

  let start: AgentMoveStart;
  try {
    start = await wire.moveAgent(pending.agentId, pending.teamSlug);
    options.onMoveAccepted?.(start.moveId);
  } catch (err) {
    const verdict = classifyMoveRePost(shareErrorCode(err));
    if (verdict.kind === "refused")
      return { outcome: "refused", code: verdict.code };
    if (verdict.kind === "rejected")
      return { outcome: "rejected", code: verdict.code ?? undefined };
    return { outcome: verdict.kind };
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
      continue;
    }
    if (status.status !== "moving") return status;
  }
  return null;
}

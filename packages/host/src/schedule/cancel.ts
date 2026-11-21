import {
  loadRoutineRuns,
  pruneRoutineRuns,
  saveRoutineRuns,
  upsertById,
} from "@houston/domain";
import type { RoutineRun } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { ChannelCtx, RuntimeChannel } from "../ports";
import type { Vfs } from "../vfs";
import { withRunsFile } from "./runs-lock";

export interface CancelRowDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  now: () => Date;
}

export interface CancelRunDeps extends CancelRowDeps {
  channel: RuntimeChannel;
  events?: EventHub;
}

export interface StoppedPooledRun {
  sessionKey: string;
  startedAt: string;
}

export type CancelRowResult =
  | { status: "cancelled"; run: RoutineRun }
  | { status: "not_found" }
  | { status: "not_running" };

export type CancelRunResult =
  | {
      status: "cancelled";
      run: RoutineRun;
      abortFailed: boolean;
    }
  | { status: "not_found" }
  | { status: "not_running" };

export async function cancelRunRow(
  deps: CancelRowDeps,
  ws: Workspace,
  agent: Agent,
  routineId: string,
  runId: string,
  stopped?: StoppedPooledRun,
): Promise<CancelRowResult> {
  const root = deps.paths.agentRoot(ws, agent);
  return withRunsFile(root, async (): Promise<CancelRowResult> => {
    const { items } = await loadRoutineRuns(deps.vfs, root);
    const run = items.find((r) => r.id === runId && r.routine_id === routineId);
    if (run && run.status !== "running") return { status: "not_running" };
    const live = run ?? stoppedRow(routineId, runId, stopped);
    if (!live) return { status: "not_found" };
    const cancelled: RoutineRun = {
      ...live,
      status: "cancelled",
      summary: "Stopped by user",
      completed_at: deps.now().toISOString(),
    };
    const next = run
      ? upsertById(items, cancelled)
      : withStoppedRun(items, cancelled);
    if (!next) return { status: "not_running" };
    await saveRoutineRuns(deps.vfs, root, next);
    return { status: "cancelled", run: cancelled };
  });
}

function withStoppedRun(
  items: RoutineRun[],
  row: RoutineRun,
): RoutineRun[] | null {
  const capped = pruneRoutineRuns(
    [...items, row].sort((a, b) => {
      const [x, y] = [startOf(a), startOf(b)];
      return x === y ? 0 : x > y ? -1 : 1;
    }),
  );
  return capped.includes(row) ? capped : null;
}

function startOf(run: RoutineRun): number {
  const parsed = Date.parse(run.started_at);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function stoppedRow(
  routineId: string,
  runId: string,
  stopped: StoppedPooledRun | undefined,
): RoutineRun | null {
  if (!stopped) return null;
  return {
    id: runId,
    routine_id: routineId,
    status: "running",
    session_key: stopped.sessionKey,
    started_at: stopped.startedAt,
  };
}

export async function cancelRoutineRun(
  deps: CancelRunDeps,
  ws: Workspace,
  agent: Agent,
  routineId: string,
  runId: string,
): Promise<CancelRunResult> {
  const flipped = await cancelRunRow(deps, ws, agent, routineId, runId);
  if (flipped.status !== "cancelled") return flipped;
  deps.events?.emit(ws.ownerUserId, {
    type: "RoutineRunsChanged",
    agentPath: agent.id,
  });

  const ctx: ChannelCtx = { workspace: ws, agent };
  try {
    await deps.channel.cancelTurn(ctx, flipped.run.session_key);
  } catch (err) {
    console.error(
      `[routines] turn abort failed for run ${runId}:`,
      err instanceof Error ? err.message : err,
    );
    return { ...flipped, abortFailed: true };
  }
  return { ...flipped, abortFailed: false };
}

import { loadRoutineRuns, saveRoutineRuns } from "@houston/domain";
import type { RoutineRun } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { ChannelCtx, RuntimeChannel } from "../ports";
import type { Vfs } from "../vfs";

export interface CancelRunDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  channel: RuntimeChannel;
  events?: EventHub;
  now: () => Date;
}

export type CancelRunResult =
  | { status: "cancelled"; run: RoutineRun }
  | { status: "not_found" }
  | { status: "not_running" };

/**
 * Stop an in-flight routine run. The run row goes terminal FIRST — reconcile
 * only ever touches `running` rows, so a concurrently-finishing turn can never
 * flip a cancelled run back (the Rust cancel_run ordering). Then the live turn
 * is aborted through the workspace's channel; an abort failure is reported
 * (never swallowed) but the run stays cancelled — the user asked it to stop.
 */
export async function cancelRoutineRun(
  deps: CancelRunDeps,
  ws: Workspace,
  agent: Agent,
  routineId: string,
  runId: string,
): Promise<CancelRunResult> {
  const root = deps.paths.agentRoot(ws, agent);
  const { items } = await loadRoutineRuns(deps.vfs, root);
  const run = items.find((r) => r.id === runId && r.routine_id === routineId);
  if (!run) return { status: "not_found" };
  if (run.status !== "running") return { status: "not_running" };

  const cancelled: RoutineRun = {
    ...run,
    status: "cancelled",
    summary: "Stopped by user",
    completed_at: deps.now().toISOString(),
  };
  await saveRoutineRuns(
    deps.vfs,
    root,
    items.map((r) => (r.id === runId ? cancelled : r)),
  );
  deps.events?.emit(ws.ownerUserId, {
    type: "RoutineRunsChanged",
    agentPath: agent.id,
  });

  const ctx: ChannelCtx = { workspace: ws, agent };
  try {
    await deps.channel.cancelTurn(ctx, run.session_key);
  } catch (err) {
    // The row is already terminal; this only means the runtime may still be
    // burning the turn. Loud on purpose — a stuck abort is a real bug signal.
    console.error(
      `[routines] turn abort failed for run ${runId}:`,
      err instanceof Error ? err.message : err,
    );
  }
  return { status: "cancelled", run: cancelled };
}

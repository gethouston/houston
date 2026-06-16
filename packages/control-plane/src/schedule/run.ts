import type { Routine } from "@houston/protocol";
import { createRoutineRun, loadRoutineRuns, saveRoutineRuns } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { Vfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
import type { EventHub } from "../events/hub";
import type { RoutineFirer } from "./scheduler";

/** Inputs shared by the scheduler's tick and the on-demand "run now" route. */
export interface FireRoutineDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  firer: RoutineFirer;
  events?: EventHub;
  now: () => Date;
  newId: () => string;
}

/**
 * Record a routine run and fire it through the channel — the SINGLE path a
 * scheduled tick and a hand-pressed "run now" both go through, so an on-demand
 * run is indistinguishable from a cron one (same run record, same firer, same
 * reconcile-driven completion).
 *
 * The "running" run is persisted FIRST (so the board shows it immediately and a
 * fire failure has a record to mark), then the turn is started. A fire failure
 * marks the run errored — never stuck "running", never a silent miss — and
 * re-throws so an HTTP caller can surface the real reason to the user (the
 * scheduler, having no UI thread, catches + logs it instead).
 */
export async function fireRoutineRun(
  deps: FireRoutineDeps,
  ws: Workspace,
  agent: Agent,
  routine: Routine,
): Promise<{ runId: string; conversationId: string }> {
  const root = deps.paths.agentRoot(ws, agent);
  const runId = deps.newId();
  const run = createRoutineRun(routine, runId, deps.now().toISOString());
  const { items } = await loadRoutineRuns(deps.vfs, root);
  await saveRoutineRuns(deps.vfs, root, [run, ...items]); // newest first
  deps.events?.emit(ws.ownerUserId, { type: "RoutineRunsChanged", agentPath: agent.id });

  try {
    await deps.firer.fire({ workspace: ws, agent, routine, conversationId: run.session_key, runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { items: current } = await loadRoutineRuns(deps.vfs, root);
    await saveRoutineRuns(
      deps.vfs,
      root,
      current.map((r) =>
        r.id === runId
          ? { ...r, status: "error" as const, summary: message, completed_at: deps.now().toISOString() }
          : r,
      ),
    );
    deps.events?.emit(ws.ownerUserId, { type: "RoutineRunsChanged", agentPath: agent.id });
    throw err;
  }
  return { runId, conversationId: run.session_key };
}

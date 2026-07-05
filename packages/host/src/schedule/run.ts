import {
  createRoutineRun,
  loadRoutineRuns,
  pruneRoutineRuns,
  saveRoutineRuns,
} from "@houston/domain";
import type { Routine } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
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
 * The routine already has a run in flight — an expected outcome, not a fault:
 * "run now" maps it to a 409, the scheduler skips the instant quietly.
 */
export class RoutineBusyError extends Error {
  constructor(routineName: string) {
    super(`"${routineName}" is already running`);
    this.name = "RoutineBusyError";
  }
}

/**
 * Record a routine run and fire it through the channel — the SINGLE path a
 * scheduled tick and a hand-pressed "run now" both go through, so an on-demand
 * run is indistinguishable from a cron one (same run record, same firer, same
 * reconcile-driven completion).
 *
 * Per-routine in-flight gate (parity with the Rust create_if_routine_idle): a
 * routine whose previous run is still going never double-fires into the same
 * conversation. A stuck "running" row can't wedge the gate forever — reconcile
 * times a reply-less run out and errors it.
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
  const { items } = await loadRoutineRuns(deps.vfs, root);
  if (items.some((r) => r.routine_id === routine.id && r.status === "running"))
    throw new RoutineBusyError(routine.name);
  const runId = deps.newId();
  const run = createRoutineRun(routine, runId, deps.now().toISOString());
  // Newest first; prune keeps the history at the Rust engine's per-routine cap
  // so routine_runs.json can't grow without bound.
  await saveRoutineRuns(deps.vfs, root, pruneRoutineRuns([run, ...items]));
  deps.events?.emit(ws.ownerUserId, {
    type: "RoutineRunsChanged",
    agentPath: agent.id,
  });

  try {
    await deps.firer.fire({
      workspace: ws,
      agent,
      routine,
      conversationId: run.session_key,
      runId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { items: current } = await loadRoutineRuns(deps.vfs, root);
    await saveRoutineRuns(
      deps.vfs,
      root,
      current.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "error" as const,
              summary: message,
              completed_at: deps.now().toISOString(),
            }
          : r,
      ),
    );
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutineRunsChanged",
      agentPath: agent.id,
    });
    throw err;
  }
  return { runId, conversationId: run.session_key };
}

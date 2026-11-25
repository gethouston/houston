import {
  createRoutineRun,
  loadRoutineRuns,
  pruneRoutineRuns,
  saveRoutineRuns,
  unconnectedRoutineFailure,
  upsertById,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { pauseFailingRoutines } from "./auto-pause";
import { isUnconnectedRefusal, routineRunFailureSummary } from "./run-failure";
import { withRunsFile } from "./runs-lock";
import type { RoutineFirer } from "./scheduler";

export interface FireRoutineDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  firer: RoutineFirer;
  events?: EventHub;
  now: () => Date;
  newId: () => string;
}

export class RoutineBusyError extends Error {
  constructor(routineName: string) {
    super(`"${routineName}" is already running`);
    this.name = "RoutineBusyError";
  }
}

export class RoutineRunUnrecordedError extends Error {
  constructor(reason: unknown, recordFailure?: unknown) {
    const message = (e: unknown) =>
      e instanceof Error ? e.message : String(e);
    super(
      recordFailure === undefined
        ? message(reason)
        : `${message(reason)} (its errored run could not be recorded: ${message(recordFailure)})`,
    );
    this.name = "RoutineRunUnrecordedError";
  }
}

// WHY: Start the turn outside the runs queue so a cold start never blocks a cancel. ADR-0016
export async function fireRoutineRun(
  deps: FireRoutineDeps,
  ws: Workspace,
  agent: Agent,
  routine: Routine,
  manual = false,
): Promise<{ runId: string; conversationId: string }> {
  const root = deps.paths.agentRoot(ws, agent);
  const runId = deps.newId();
  const created = createRoutineRun(routine, runId, deps.now().toISOString());
  const run: RoutineRun = manual ? { ...created, manual: true } : created;
  try {
    await withRunsFile(root, async () => {
      const { items } = await loadRoutineRuns(deps.vfs, root);
      if (
        items.some((r) => r.routine_id === routine.id && r.status === "running")
      )
        throw new RoutineBusyError(routine.name);
      await saveRoutineRuns(deps.vfs, root, pruneRoutineRuns([run, ...items]));
    });
  } catch (err) {
    if (err instanceof RoutineBusyError) throw err;
    throw new RoutineRunUnrecordedError(err);
  }
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
    const failure = isUnconnectedRefusal(err)
      ? unconnectedRoutineFailure(routine.provider || err.provider)
      : undefined;
    await markRunErrored(root, err, async () => {
      const { items: current } = await loadRoutineRuns(deps.vfs, root);
      const row = current.find((r) => r.id === runId);
      if (row?.status !== "running") return;
      await saveRoutineRuns(
        deps.vfs,
        root,
        upsertById(current, {
          ...row,
          status: "error",
          summary: failure ? routineRunFailureSummary(failure) : message,
          ...(failure ? { failure } : {}),
          completed_at: deps.now().toISOString(),
        }),
      );
    });
    deps.events?.emit(ws.ownerUserId, {
      type: "RoutineRunsChanged",
      agentPath: agent.id,
    });
    if (failure)
      await pauseFailingRoutines(deps, ws, agent, root, [routine.id]).catch(
        (pauseError: unknown) =>
          console.error(
            `[routine-auto-pause] pause of ${agent.id}/${routine.id} failed:`,
            pauseError,
          ),
      );
    throw err;
  }
  return { runId, conversationId: run.session_key };
}

async function markRunErrored(
  root: string,
  fireError: unknown,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await withRunsFile(root, write);
  } catch (err) {
    throw new RoutineRunUnrecordedError(fireError, err);
  }
}

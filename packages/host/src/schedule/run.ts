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
 * The fire did not happen or failed, and NO errored run records it: the
 * "running" row could not be written before the fire, or the errored mark
 * could not be written after a failed one. The person has nothing to see, so
 * a delivered instant must stay deliverable (routes/routine-fires.ts). The
 * message is the underlying failure's, so callers that show it are unchanged.
 */
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

/**
 * Record a routine run and fire it through the channel — the SINGLE path a
 * scheduled tick and a hand-pressed "run now" both go through, so an on-demand
 * run is indistinguishable from a cron one (same run record, same firer, same
 * reconcile-driven completion).
 *
 * Per-routine in-flight gate (parity with the Rust create_if_routine_idle): a
 * routine whose previous run is still going never double-fires into the same
 * conversation. The gate + record write run under the per-agent runs-file
 * queue (runs-lock.ts), so a scheduler tick racing a hand-pressed "run now"
 * can't both pass the gate or drop each other's rows. A stuck "running" row
 * can't wedge the gate forever — reconcile times a reply-less run out and
 * errors it.
 *
 * The "running" run is persisted FIRST (so the board shows it immediately and a
 * fire failure has a record to mark), then the turn is started OUTSIDE the
 * queue (a cold start must never block a cancel). A fire failure marks the run
 * errored — never stuck "running", never a silent miss — and re-throws so an
 * HTTP caller can surface the real reason to the user (the scheduler, having
 * no UI thread, catches + logs it instead).
 */
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
  // A "Run now" runs as whoever pressed it; the row says so, since the
  // snooze rules (domain snoozeAfterRun) only trust a run as the creator's.
  const run: RoutineRun = manual ? { ...created, manual: true } : created;
  try {
    await withRunsFile(root, async () => {
      const { items } = await loadRoutineRuns(deps.vfs, root);
      if (
        items.some((r) => r.routine_id === routine.id && r.status === "running")
      )
        throw new RoutineBusyError(routine.name);
      // Newest first; prune keeps the history at the Rust engine's per-routine
      // cap so routine_runs.json can't grow without bound.
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
    // The runtime refused the fire outright because nothing usable is
    // connected for the identity the routine runs as — the creator's
    // (PRODUCT-1475). It blames the routine's pin, else the agent's saved
    // provider the refusal names; with neither it reads as "no model chosen"
    // (PRODUCT-1982). Typed every way, so all of them stop at the pause.
    const failure = isUnconnectedRefusal(err)
      ? unconnectedRoutineFailure(routine.provider || err.provider)
      : undefined;
    await markRunErrored(root, err, async () => {
      const { items: current } = await loadRoutineRuns(deps.vfs, root);
      const row = current.find((r) => r.id === runId);
      // The row can only be missing/terminal if a cancel raced the failed
      // fire — leave what the user set.
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
    // The errored row is already written: a failed pause must not replace the
    // fire's own error, or a caller reads it as "never recorded" and the
    // instant is redelivered into a second errored row. Reported (console.error
    // reaches Sentry), and the next failed run retries the pause.
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

/**
 * The errored mark after a failed fire. If it cannot be written the run stays
 * "running" until reconcile times it out, so the failure is unrecorded.
 */
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

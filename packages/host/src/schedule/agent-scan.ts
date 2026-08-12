import { dueAt, loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { TurnFireError } from "../channel/fire-error";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { type ReconcileDeps, reconcileAgentRuns } from "./reconcile";
import { fireRoutineRun, RoutineBusyError } from "./run";

/** A due routine to run, with its resolved conversation + run id. */
export interface FiringJob {
  workspace: Workspace;
  agent: Agent;
  routine: Routine;
  conversationId: string;
  runId: string;
}

/**
 * Runs a due routine's prompt as a turn. Deployment-specific (the firing path
 * differs cloud vs local), injected into the driver. `fire` resolves once the
 * turn is ACCEPTED, not when it completes — the run's running→surfaced/silent
 * transition is driven by turn completion.
 */
export interface RoutineFirer {
  fire(job: FiringJob): Promise<void>;
}

/** The dedup primitive the scheduler needs from the bus (atomic set-if-absent). */
export interface FireLock {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

/** What one agent's scan needs — SchedulerDeps minus the workspace listing. */
export interface AgentScanDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  lock: FireLock;
  firer: RoutineFirer;
  events?: EventHub;
  now: () => Date;
  newId: () => string;
  /** Dedup-lock TTL (s); must exceed the scan interval. */
  dedupTtlSec: number;
  replyReader?: ReconcileDeps["replyReader"];
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * One agent's slice of a tick: fire the routines that came due in
 * (`since`, `now`], then settle the runs whose turn has finished.
 *
 * The two halves are isolated from each other, and from the sweep that calls
 * this. Houston is files-first — agents write their own `.houston` docs — so ANY
 * of them can be unreadable at any moment, and an unreadable document must cost
 * exactly the reader that needs it. A single BOM-prefixed routines.json threw
 * out of the whole scan loop and stopped every routine on a pod for six days
 * (HOU-953); now a broken routines.json still lets that agent's runs settle, and
 * a broken agent still lets every other agent fire.
 *
 * This is the background scan with no UI thread to toast on, so a failure logs
 * (the sanctioned `console.error` boundary) and the sweep continues.
 */
export async function scanAgent(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  timezone: string | null,
  since: Date,
  now: Date,
): Promise<void> {
  const where = `${ws.id}/${agent.id}`;
  try {
    const root = deps.paths.agentRoot(ws, agent);
    const { items: routines } = await loadRoutines(deps.vfs, root);
    for (const routine of routines) {
      const at = dueAt(routine, since, now, timezone);
      if (!at) continue;
      // The instant is replica-independent → all replicas race for one key.
      const won = await deps.lock.setNx(
        `routine:fired:${routine.id}:${at.toISOString()}`,
        "1",
        deps.dedupTtlSec,
      );
      if (won) await fireRoutine(deps, ws, agent, routine);
    }
  } catch (err) {
    console.error(`[scheduler] ${where} routine scan failed:`, reason(err));
  }

  // Complete runs whose turn has finished (silent/surfaced/timeout). Runs live
  // in their own document, so they settle even when routines.json is unreadable.
  try {
    await reconcileAgentRuns(
      {
        vfs: deps.vfs,
        paths: deps.paths,
        lock: deps.lock,
        events: deps.events,
        now: deps.now,
        newId: deps.newId,
        replyReader: deps.replyReader,
      },
      ws,
      agent,
    );
  } catch (err) {
    console.error(`[scheduler] ${where} run reconcile failed:`, reason(err));
  }
}

/**
 * Record + fire one due routine. Shares `fireRoutineRun` with the on-demand
 * "run now" route, so a scheduled run and a hand-pressed one are identical
 * (same record, same firer, same errored-on-fail bookkeeping). The helper
 * rethrows a fire failure; here we log it and let the scan continue to the
 * next routine.
 */
async function fireRoutine(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  routine: Routine,
): Promise<void> {
  try {
    await fireRoutineRun(
      {
        vfs: deps.vfs,
        paths: deps.paths,
        firer: deps.firer,
        events: deps.events,
        now: deps.now,
        newId: deps.newId,
      },
      ws,
      agent,
      routine,
    );
  } catch (err) {
    // Expected when the previous run is still in flight — the instant is
    // skipped (its dedup lock is already burned), not an error.
    if (err instanceof RoutineBusyError) return;
    // A routine firing while the workspace has no provider connected is an
    // expected user state, not an engine fault (HOUSTON-APP-4XM): the run is
    // already recorded errored with the real reason (user-visible in the
    // routine's history), so a warning breadcrumb suffices here.
    if (err instanceof TurnFireError && err.code === "no_provider") {
      console.warn(`[scheduler] routine ${routine.id} skipped: ${err.message}`);
      return;
    }
    console.error(
      `[scheduler] routine ${routine.id} fire failed:`,
      reason(err),
    );
  }
}

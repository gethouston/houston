import { dueAt, loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { TurnFireError } from "../channel/fire-error";
import type { Agent, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { burnRoutineFireInstant, type FireLock } from "./fire-lock";
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
  /** External mode skips only cron evaluation/firing; reconcile still runs. */
  cronFiresEnabled: boolean;
  /**
   * Backstop delay for cron fires (scheduler.ts EXTERNAL_FIRE_GRACE_MS): an
   * instant is only eligible once it is this old, so the control plane's
   * identity-carrying delivery wins every live race and the local cron picks
   * up only instants that delivery left unclaimed. 0 = fire on due (desktop /
   * self-host, where no external delivery exists).
   */
  cronFireGraceMs: number;
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
    if (deps.cronFiresEnabled) {
      const root = deps.paths.agentRoot(ws, agent);
      const { items: routines } = await loadRoutines(deps.vfs, root);
      // The grace shifts the WHOLE evaluation window, not just a threshold on
      // `at`: consecutive ticks' shifted windows still tile exactly, so every
      // instant is evaluated once — `at` stays the true cron instant, and the
      // dedup key below matches the one the external delivery burns.
      const grace = deps.cronFireGraceMs;
      const evalSince = grace ? new Date(since.getTime() - grace) : since;
      const evalNow = grace ? new Date(now.getTime() - grace) : now;
      for (const routine of routines) {
        const at = dueAt(routine, evalSince, evalNow, timezone);
        if (!at) continue;
        const won = await burnRoutineFireInstant(
          deps.lock,
          routine.id,
          at,
          deps.dedupTtlSec,
        );
        if (won) await fireRoutine(deps, ws, agent, routine);
      }
    }
  } catch (err) {
    console.error(`[scheduler] ${where} routine scan failed:`, reason(err));
  }

  // Complete runs whose turn has finished (silent/surfaced/timeout). Runs live
  // in their own document, so they settle even when routines.json is unreadable.
  await reconcile(deps, ws, agent, where);
}

async function reconcile(
  deps: AgentScanDeps,
  ws: Workspace,
  agent: Agent,
  where: string,
): Promise<void> {
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

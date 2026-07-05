import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import { cancelRoutineRun } from "../schedule/cancel";
import { ChannelRoutineFirer } from "../schedule/firer";
import { fireRoutineRun, RoutineBusyError } from "../schedule/run";
import {
  type AgentRouteDeps,
  authorizeAgent,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { json } from "./http";

/**
 * The routine-run routes: on-demand fire ("run now") and stop. Both must be
 * matched BEFORE the generic per-agent runtime dispatch — the runtime has no
 * routine routes. Returns true when the request was handled.
 */
export async function handleRoutineRuns(
  deps: AgentRouteDeps,
  userId: string,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  // Run a routine ON DEMAND: fire it now through the SAME firer + record path
  // the scheduler uses, so a hand-pressed run is indistinguishable from a cron
  // one (records a routine_run, reconcile completes it). A fire failure
  // surfaces as a real status — never a silent miss.
  const runNow = path.match(/^\/agents\/([^/]+)\/routines\/([^/]+)\/run$/);
  if (runNow && method === "POST") {
    // The `[^/]+` captures are non-empty by construction.
    const agentId = decodeURIComponent(runNow[1] ?? "");
    const routineId = decodeURIComponent(runNow[2] ?? "");
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    if (!deps.vfs) {
      json(res, 503, { error: "agent data not configured" });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    const paths = deps.paths ?? DEFAULT_PATHS;
    const root = paths.agentRoot(authz.workspace, authz.agent);
    const { items: routines } = await loadRoutines(deps.vfs, root);
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) {
      json(res, 404, { error: "routine not found" });
      return true;
    }
    // The firer wraps the workspace's channel — the exact path
    // ChannelRoutineFirer takes for the scheduler. fireRoutineRun records the
    // run, then fires; a fire failure marks the run errored AND rethrows, so
    // we answer 502 (never 200).
    const firer = new ChannelRoutineFirer(deps.channels);
    try {
      const { runId } = await fireRoutineRun(
        {
          vfs: deps.vfs,
          paths,
          firer,
          events: deps.events,
          now: () => new Date(),
          newId: () => crypto.randomUUID(),
        },
        authz.workspace,
        authz.agent,
        routine,
      );
      json(res, 200, { ok: true, runId });
    } catch (err) {
      // A run already in flight is a 409 the UI can toast plainly (the Rust
      // engine's Conflict); anything else is a real fire failure.
      json(res, err instanceof RoutineBusyError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  // Stop an in-flight routine run: the row goes terminal first, then the live
  // turn is aborted through the channel (schedule/cancel.ts).
  const runCancel = path.match(
    /^\/agents\/([^/]+)\/routines\/([^/]+)\/runs\/([^/]+)\/cancel$/,
  );
  if (runCancel && method === "POST") {
    const agentId = decodeURIComponent(runCancel[1] ?? "");
    const routineId = decodeURIComponent(runCancel[2] ?? "");
    const runId = decodeURIComponent(runCancel[3] ?? "");
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    if (!deps.vfs) {
      json(res, 503, { error: "agent data not configured" });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    const result = await cancelRoutineRun(
      {
        vfs: deps.vfs,
        paths: deps.paths ?? DEFAULT_PATHS,
        channel,
        events: deps.events,
        now: () => new Date(),
      },
      authz.workspace,
      authz.agent,
      routineId,
      runId,
    );
    if (result.status === "not_found")
      json(res, 404, { error: "run not found" });
    else if (result.status === "not_running")
      json(res, 409, { error: "run is not running" });
    // The run is cancelled either way; `abort_failed` (additive) tells the
    // client the live-turn abort itself failed — the runtime may still be
    // burning the turn (no-silent-failures: the caller can surface it).
    else
      json(res, 200, {
        ...result.run,
        ...(result.abortFailed ? { abort_failed: true } : {}),
      });
    return true;
  }

  return false;
}

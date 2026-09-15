import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import { cancelRoutineRun } from "../schedule/cancel";
import { ChannelRoutineFirer } from "../schedule/firer";
import { fireRoutineRun, RoutineBusyError } from "../schedule/run";
import type { Vfs } from "../vfs";
import {
  type AgentRouteDeps,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
  trustedActingAs,
} from "./agent-authz";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * The routine-run routes: on-demand fire ("run now") and stop. Both are matched
 * BEFORE the generic per-agent runtime dispatch — the runtime has no routine
 * routes — and a wrong method on either falls through to it exactly as before.
 */
const SOURCE = "packages/host/src/routes/routine-runs.ts";

interface RunWiring {
  vfs: Vfs;
  paths: WorkspacePaths;
  channel: RuntimeChannel;
  root: string;
}

/**
 * The storage and the live channel both routes need, or null once the 503 has
 * been answered: a run that cannot reach the runtime must never read as one
 * that started.
 */
function runWiring(
  deps: AgentRouteDeps,
  authz: { workspace: Workspace; agent: Agent },
  res: ServerResponse,
): RunWiring | null {
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return null;
  }
  const channel = channelFor(deps, authz.workspace);
  if (!channel) {
    noChannel(res, authz.workspace.runtime);
    return null;
  }
  const paths = deps.paths ?? DEFAULT_PATHS;
  return {
    vfs: deps.vfs,
    paths,
    channel,
    root: paths.agentRoot(authz.workspace, authz.agent),
  };
}

/**
 * Run a routine ON DEMAND: fire it now through the SAME firer + record path the
 * scheduler uses, so a hand-pressed run is indistinguishable from a cron one
 * (records a routine_run, reconcile completes it). A fire failure surfaces as a
 * real status — never a silent miss.
 */
defineRoute({
  group: "routine-runs",
  method: "POST",
  path: "/agents/:agentId/routines/:routineId/run",
  phase: "agent",
  classification: "sdk",
  source: SOURCE,
  async handler({ deps, authz, params, req, res }) {
    const wiring = runWiring(deps, authz, res);
    if (!wiring) return;
    const { items: routines } = await loadRoutines(wiring.vfs, wiring.root);
    const routine = routines.find((r) => r.id === params.routineId);
    if (!routine) return json(res, 404, { error: "routine not found" });
    // The firer wraps the workspace's channel — the exact path
    // ChannelRoutineFirer takes for the scheduler. fireRoutineRun records the
    // run, then fires; a fire failure marks the run errored AND rethrows, so
    // we answer 502 (never 200).
    //
    // The run acts as the person who pressed the button: on a managed pod the
    // gateway-minted acting-as token rides along, so the turn resolves THEIR
    // credential scope — the same identity the gateway's own pool run-now
    // mints, and the identity the routine screen's connection badge probed.
    // Without it the firer falls back to the creator's bare sub, which a pod
    // cannot elevate (HOU-976 D10), so the run landed on the TEAM credential:
    // in a team space where the presser connected a provider personally, the
    // badge said "connected" and the run failed "creator has no account
    // connected". Scheduled fires never had this gap (the control plane
    // mints the creator's token for them).
    const firer = new ChannelRoutineFirer(
      deps.channels,
      trustedActingAs(deps, req),
    );
    try {
      const { runId } = await fireRoutineRun(
        {
          vfs: wiring.vfs,
          paths: wiring.paths,
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
  },
});

/**
 * Stop an in-flight routine run: the row goes terminal first, then the live
 * turn is aborted through the channel (schedule/cancel.ts).
 */
defineRoute({
  group: "routine-runs",
  method: "POST",
  path: "/agents/:agentId/routines/:routineId/runs/:runId/cancel",
  phase: "agent",
  classification: "sdk",
  source: SOURCE,
  async handler({ deps, authz, params, res }) {
    const wiring = runWiring(deps, authz, res);
    if (!wiring) return;
    const result = await cancelRoutineRun(
      {
        vfs: wiring.vfs,
        paths: wiring.paths,
        channel: wiring.channel,
        events: deps.events,
        now: () => new Date(),
      },
      authz.workspace,
      authz.agent,
      params.routineId ?? "",
      params.runId ?? "",
    );
    if (result.status === "not_found")
      return json(res, 404, { error: "run not found" });
    if (result.status === "not_running")
      return json(res, 409, { error: "run is not running" });
    // The run is cancelled either way; `abort_failed` (additive) tells the
    // client the live-turn abort itself failed — the runtime may still be
    // burning the turn (no-silent-failures: the caller can surface it).
    json(res, 200, {
      ...result.run,
      ...(result.abortFailed ? { abort_failed: true } : {}),
    });
  },
});

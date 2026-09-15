import { loadRoutineRuns } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import type { Vfs } from "../vfs";
import {
  type AgentRouteDeps,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { json } from "./http";
import { defineRoute } from "./registry";

/**
 * One agent's turn/routine busy inputs — the shared core of the per-agent
 * probe below and the pod-level `GET /activity` aggregate. The caller resolves
 * the channel and the vfs first (the two probes answer their absence
 * differently: 503 per-agent, conservative busy at pod level).
 */
async function agentBusyInputs(
  deps: AgentRouteDeps,
  vfs: Vfs,
  channel: RuntimeChannel,
  ctx: { workspace: Workspace; agent: Agent },
): Promise<{ turnBusy: boolean; runningRoutineRuns: number }> {
  const paths = deps.paths ?? DEFAULT_PATHS;
  const runs = await loadRoutineRuns(
    vfs,
    paths.agentRoot(ctx.workspace, ctx.agent),
  );
  const runningRoutineRuns = runs.items.filter(
    (run) => run.status === "running",
  ).length;
  const turnBusy = await channel.busy(ctx);
  return { turnBusy, runningRoutineRuns };
}

async function activityStatus(
  deps: AgentRouteDeps,
  ctx: { workspace: Workspace; agent: Agent },
) {
  const channel = channelFor(deps, ctx.workspace);
  if (!channel) return null;
  if (!deps.vfs) return { error: "agent data not configured" as const };

  const { turnBusy, runningRoutineRuns } = await agentBusyInputs(
    deps,
    deps.vfs,
    channel,
    ctx,
  );
  const runtime = channel.runtimeStatus
    ? await channel.runtimeStatus(ctx)
    : "unknown";
  // Other /agents/* requests held open right now — minus this probe itself.
  // Catches what the turn check cannot: an open conversation-events SSE
  // subscription (an agent open in a UI tab) between turns. Two probes
  // overlapping see each other and both answer busy — conservative, and gone
  // by the next sweep.
  const activeRequests = deps.agentRequestCount
    ? Math.max(0, deps.agentRequestCount() - 1)
    : 0;
  return {
    busy: turnBusy || runningRoutineRuns > 0 || activeRequests > 0,
    runtime,
    runningRoutineRuns,
    activeRequests,
  };
}

/**
 * `GET /agents/:agentId/activity` — the gateway's per-agent idle-sleep probe.
 * It reports whether a runtime turn or a routine run is still active without
 * falling through to the runtime dispatch surface (routes/agents.ts).
 */
defineRoute({
  group: "agent-activity",
  method: "GET",
  path: "/agents/:agentId/activity",
  phase: "agent",
  classification: "infra",
  reason:
    "The cloud waker's per-agent idle sweep polls it to decide whether the pod may sleep; no UI reads it.",
  // A POST here must NOT 405: it falls past this check into the generic
  // dispatch and is proxied to the agent's own runtime.
  methodMismatch: "fallthrough",
  source: "packages/host/src/routes/agents-activity.ts",
  async handler({ deps, authz, res }) {
    const status = await activityStatus(deps, {
      workspace: authz.workspace,
      agent: authz.agent,
    });
    if (!status) return noChannel(res, authz.workspace.runtime);
    if ("error" in status) return json(res, 503, { error: status.error });
    json(res, 200, status);
  },
});

/**
 * Pod-level busy aggregate for `GET /activity` (routes/pod-activity.ts): every
 * agent in every workspace on this host — engine pods are single-tenant, so the
 * store-wide enumeration IS the pod's population. The control plane's
 * pre-roll probe (same parsing rule as the waker's idle sweep) treats
 * anything but a literal `busy: false` as busy, so `false` must mean
 * provably idle: an agent whose workspace has no channel wired, whose vfs is
 * unconfigured, or that throws while probed counts as busy rather than
 * failing the whole answer.
 */
export async function podActivityStatus(deps: AgentRouteDeps): Promise<{
  busy: boolean;
  activeRequests: number;
  runningRoutineRuns: number;
  busyAgents: number;
}> {
  // The counter is pod-global (server.ts counts /agents/*-prefixed requests),
  // so read it ONCE — and unlike the per-agent probe above, /activity is not
  // under /agents/, so it never counts itself: no self-subtraction here.
  const activeRequests = deps.agentRequestCount ? deps.agentRequestCount() : 0;
  let runningRoutineRuns = 0;
  let busyAgents = 0;
  for (const workspace of await deps.store.listWorkspaces()) {
    const channel = channelFor(deps, workspace);
    for (const agent of await deps.store.listAgents(workspace.id)) {
      if (!channel || !deps.vfs) {
        busyAgents++;
        continue;
      }
      try {
        const { turnBusy, runningRoutineRuns: running } = await agentBusyInputs(
          deps,
          deps.vfs,
          channel,
          { workspace, agent },
        );
        runningRoutineRuns += running;
        if (turnBusy || running > 0) busyAgents++;
      } catch {
        busyAgents++; // an unprobeable agent must not read as idle
      }
    }
  }
  return {
    busy: busyAgents > 0 || activeRequests > 0,
    activeRequests,
    runningRoutineRuns,
    busyAgents,
  };
}

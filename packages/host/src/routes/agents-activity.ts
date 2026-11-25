import { loadRoutineRuns } from "@houston/domain";
import { assistantApprovals } from "../assistant/approvals";
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
  const loginPending = channel.loginPending
    ? await channel.loginPending(ctx)
    : false;
  const activeRequests = deps.agentRequestCount
    ? Math.max(0, deps.agentRequestCount() - 1)
    : 0;
  const activeWrites = deps.agentWriteCount ? deps.agentWriteCount() : 0;
  const pendingApprovals = assistantApprovals.pendingCount(ctx.agent.id);
  const pendingOAuth = deps.customIntegrations?.pendingOAuthAttempts ?? 0;
  return {
    busy: turnBusy || runningRoutineRuns > 0 || activeRequests > 0,
    runtime,
    turnBusy,
    loginPending,
    runningRoutineRuns,
    activeRequests,
    activeWrites,
    pendingApprovals,
    pendingOAuth,
  };
}

defineRoute({
  group: "agent-activity",
  method: "GET",
  path: "/agents/:agentId/activity",
  phase: "agent",
  classification: "infra",
  reason:
    "The cloud waker's per-agent idle sweep polls it to decide whether the pod may sleep; no UI reads it.",
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

// WHY: The control plane reads anything but a literal busy: false as busy; false must mean provably idle. ADR-0016
export async function podActivityStatus(deps: AgentRouteDeps): Promise<{
  busy: boolean;
  activeRequests: number;
  runningRoutineRuns: number;
  busyAgents: number;
  pendingApprovals: number;
  pendingOAuth: number;
}> {
  const activeRequests = deps.agentRequestCount ? deps.agentRequestCount() : 0;
  let runningRoutineRuns = 0;
  let busyAgents = 0;
  let pendingApprovals = 0;
  for (const workspace of await deps.store.listWorkspaces()) {
    const channel = channelFor(deps, workspace);
    for (const agent of await deps.store.listAgents(workspace.id)) {
      pendingApprovals += assistantApprovals.pendingCount(agent.id);
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
        busyAgents++;
      }
    }
  }
  return {
    busy: busyAgents > 0 || activeRequests > 0,
    activeRequests,
    runningRoutineRuns,
    busyAgents,
    pendingApprovals,
    pendingOAuth: deps.customIntegrations?.pendingOAuthAttempts ?? 0,
  };
}

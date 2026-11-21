import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import {
  ROUTINE_NOT_FOUND,
  ROUTINE_NOT_FOUND_REASON,
} from "@houston/protocol/routine-refusal";
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

const SOURCE = "packages/host/src/routes/routine-runs.ts";

interface RunWiring {
  vfs: Vfs;
  paths: WorkspacePaths;
  channel: RuntimeChannel;
  root: string;
}

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
    if (!routine)
      return json(res, 404, {
        error: ROUTINE_NOT_FOUND_REASON,
        code: ROUTINE_NOT_FOUND,
      });
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
        true,
      );
      json(res, 200, { ok: true, runId });
    } catch (err) {
      json(res, err instanceof RoutineBusyError ? 409 : 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

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
    json(res, 200, {
      ...result.run,
      ...(result.abortFailed ? { abort_failed: true } : {}),
    });
  },
});

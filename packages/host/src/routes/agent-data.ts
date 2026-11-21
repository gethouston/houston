import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutineRuns } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { handleActivitiesData } from "./agent-data-activities";
import { type AgentDataCaller, agentDataCaller } from "./agent-data-caller";
import { handleDocsData } from "./agent-data-docs";
import { handleRoutinesData } from "./agent-data-routines";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed } from "./http";
import { defineRouteFamily } from "./registry";

export { workspaceRoot } from "../paths";

const FAMILY_EVENT: Record<string, (agentPath: string) => HoustonEvent> = {
  activities: (agentPath) => ({ type: "ActivityChanged", agentPath }),
  routines: (agentPath) => ({ type: "RoutinesChanged", agentPath }),
  routine_runs: (agentPath) => ({ type: "RoutineRunsChanged", agentPath }),
  config: (agentPath) => ({ type: "ConfigChanged", agentPath }),
  learnings: (agentPath) => ({ type: "LearningsChanged", agentPath }),
};

export async function handleAgentData(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
  caller: AgentDataCaller = {},
): Promise<boolean> {
  const m = rest.match(
    /^(activities|routines|routine_runs|config|learnings)(?:\/([^/]+))?$/,
  );
  if (!m) return false;
  const family = m[1];
  if (!family) return false;
  const itemId = m[2] ? decodeURIComponent(m[2]) : null;

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const nowIso = new Date().toISOString();
  const fireChange = () => {
    const event = Object.hasOwn(FAMILY_EVENT, family)
      ? FAMILY_EVENT[family]?.(ctx.agent.id)
      : undefined;
    if (event) emit?.(event);
  };

  if (family === "activities") {
    await handleActivitiesData(
      vfs,
      root,
      ctx.agent.id,
      method,
      itemId,
      req,
      res,
      emit,
      { author: caller.author, startedBy: caller.startedBy },
    );
    return true;
  }

  if (family === "routines") {
    if (
      await handleRoutinesData(
        vfs,
        root,
        ctx.workspace.id,
        method,
        itemId,
        req,
        res,
        fireChange,
        {
          triggersEnabled: caller.triggersEnabled ?? false,
          nowIso,
          createdBy: caller.createdBy,
          ...(caller.routineFloorMinutes
            ? { minIntervalMinutes: caller.routineFloorMinutes }
            : {}),
        },
      )
    )
      return true;
  }

  if (family === "routine_runs" && method === "GET" && !itemId) {
    json(res, 200, await loadRoutineRuns(vfs, root));
    return true;
  }

  if (
    (family === "config" || family === "learnings") &&
    (await handleDocsData(
      vfs,
      root,
      family,
      method,
      itemId,
      req,
      res,
      fireChange,
    ))
  )
    return true;

  methodNotAllowed(res);
  return true;
}

defineRouteFamily({
  group: "agent-data",
  members: [
    { method: "GET", path: "/agents/:agentId/activities" },
    { method: "POST", path: "/agents/:agentId/activities" },
    { method: "PATCH", path: "/agents/:agentId/activities/:activityId" },
    { method: "DELETE", path: "/agents/:agentId/activities/:activityId" },
    { method: "GET", path: "/agents/:agentId/routines" },
    { method: "POST", path: "/agents/:agentId/routines" },
    { method: "PATCH", path: "/agents/:agentId/routines/:routineId" },
    { method: "DELETE", path: "/agents/:agentId/routines/:routineId" },
    { method: "GET", path: "/agents/:agentId/routine_runs" },
    { method: "GET", path: "/agents/:agentId/config" },
    { method: "PUT", path: "/agents/:agentId/config" },
    { method: "GET", path: "/agents/:agentId/learnings" },
    { method: "PUT", path: "/agents/:agentId/learnings" },
  ],
  owns: [
    "/agents/:agentId/config/:itemId",
    "/agents/:agentId/learnings/:itemId",
    "/agents/:agentId/routine_runs/:runId",
  ],
  methodMismatch: "405",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/agent-data.ts",
  handler: ({ deps, userId, authz, method, path, req, res, emit }) =>
    handleAgentData(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
      agentDataCaller(deps, req, userId),
    ),
});

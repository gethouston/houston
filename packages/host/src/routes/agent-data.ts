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

// The cloud-layout root, kept as a convenience for cloud tests + callers that
// don't carry a WorkspacePaths instance. Production handlers use the injected
// `paths` so the local profile gets its own layout. See paths.ts.
export { workspaceRoot } from "../paths";

/** Each typed family's reactivity event — emitted after a successful mutation. */
const FAMILY_EVENT: Record<string, (agentPath: string) => HoustonEvent> = {
  activities: (agentPath) => ({ type: "ActivityChanged", agentPath }),
  routines: (agentPath) => ({ type: "RoutinesChanged", agentPath }),
  routine_runs: (agentPath) => ({ type: "RoutineRunsChanged", agentPath }),
  config: (agentPath) => ({ type: "ConfigChanged", agentPath }),
  learnings: (agentPath) => ({ type: "LearningsChanged", agentPath }),
};

/**
 * The typed `.houston` families (activities, routines + runs, config,
 * learnings) served straight off the workspace Vfs — the SAME domain code
 * over GCS in cloud and the real agent directory locally. Intercepted before
 * channel dispatch; the runtime never sees these. Returns true when handled.
 *
 * List GETs return `{ items, diagnostics }`: agents write these files with
 * file tools, so malformed entries are dropped AND reported (beta policy —
 * the UI can surface the noise instead of silently losing it).
 */
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
  // Fire this family's reactivity event AFTER a successful write. agentPath is
  // the agent's opaque id (the UI scopes query invalidation by it).
  const fireChange = () => {
    // Own keys only: the route regex already limits `family`, and this keeps a
    // prototype name from ever reaching the call.
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

/**
 * The five families as ROUTES. One handler owns all thirteen pairs because the
 * regex above owns both the "not mine" boundary and the family-wide 405: a
 * method this family does not serve is ITS answer to give, never the next
 * route's request to claim — expanding the members into separate routes would
 * proxy a `DELETE /config` to a runtime that has no such route instead.
 */
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
  // The item shapes the regex claims and the family does not serve: config and
  // learnings are whole documents with no items, and routine runs are listed
  // only as a whole. Each is this family's 405 to give — forwarding it would
  // wake the agent's runtime for a route it has never had.
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

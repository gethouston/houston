import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutineRuns } from "@houston/domain";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import { actingAuthorFor, routineActorFor } from "../auth/acting";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { handleActivitiesData } from "./agent-data-activities";
import { handleDocsData } from "./agent-data-docs";
import { handleRoutinesData } from "./agent-data-routines";
import { agentRest } from "./agent-rest";
import { json } from "./http";
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
  // The verified acting identity of THIS request (C2) — recorded as a new
  // routine's `created_by` and re-stamped on PATCH, so a fired routine turn
  // acts as whoever last shaped it. Gateway-fronted pods pass the gateway-
  // minted acting sub (the id the gateway re-authorizes at fire time, HOU-689);
  // the desktop passes its local owner. Absent in callers that don't carry
  // identity; the field then stays as-is (absent on create).
  createdBy?: string,
  // The verified acting human as a full contributor (C2) — activities stamp
  // `created_by` + a contributor entry from it (routines take the sub-only
  // `createdBy` above). Null/absent off the gateway, keeping single-player
  // activity.json byte-identical.
  author?: ActivityContributor,
  // Whether this deployment can fire event-driven routines (a trigger backend
  // exists — Houston Cloud only). When false, a routine write carrying a
  // `trigger` binding is rejected: it could never wake here (a schedule can).
  // Reads still list existing trigger routines; the gate applies to writes only.
  triggersEnabled = false,
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
    const event = FAMILY_EVENT[family]?.(ctx.agent.id);
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
      author,
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
        { triggersEnabled, nowIso, createdBy },
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

  json(res, 405, { error: "method not allowed" });
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
      routineActorFor(deps, req, userId),
      actingAuthorFor(deps, req) ?? undefined,
      deps.triggersEnabled ?? false,
    ),
});

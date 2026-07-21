import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadConfig,
  loadLearnings,
  loadRoutineRuns,
  saveConfig,
  saveLearnings,
} from "@houston/domain";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { handleActivitiesData } from "./agent-data-activities";
import { handleRoutinesData } from "./agent-data-routines";
import { json, readJson } from "./http";

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

  if (family === "config" && !itemId) {
    if (method === "GET") {
      json(res, 200, await loadConfig(vfs, root));
      return true;
    }
    if (method === "PUT") {
      const body = await readJson(req);
      await saveConfig(vfs, root, body);
      fireChange();
      json(res, 200, body);
      return true;
    }
  }

  if (family === "learnings" && !itemId) {
    if (method === "GET") {
      json(res, 200, await loadLearnings(vfs, root));
      return true;
    }
    if (method === "PUT") {
      const body = await readJson(req);
      if (!Array.isArray(body.items)) {
        json(res, 400, { error: "missing 'items' array" });
        return true;
      }
      await saveLearnings(vfs, root, body.items);
      fireChange();
      json(res, 200, { ok: true });
      return true;
    }
  }

  json(res, 405, { error: "method not allowed" });
  return true;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyActivityUpdate,
  applyRoutineUpdate,
  createActivity,
  createRoutine,
  loadActivities,
  loadConfig,
  loadLearnings,
  loadRoutineRuns,
  loadRoutines,
  removeById,
  saveActivities,
  saveConfig,
  saveLearnings,
  saveRoutines,
  upsertById,
  validateSchedule,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { Vfs } from "../vfs";
import type { WorkspacePaths } from "../paths";
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
): Promise<boolean> {
  const m = rest.match(/^(activities|routines|routine_runs|config|learnings)(?:\/([^/]+))?$/);
  if (!m) return false;
  const family = m[1]!;
  const itemId = m[2] ? decodeURIComponent(m[2]) : null;

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const nowIso = new Date().toISOString();
  // Fire this family's reactivity event AFTER a successful write. agentPath is
  // the agent's opaque id (the UI scopes query invalidation by it).
  const fireChange = () => emit?.(FAMILY_EVENT[family]!(ctx.agent.id));

  if (family === "activities") {
    if (method === "GET" && !itemId) {
      json(res, 200, await loadActivities(vfs, root));
      return true;
    }
    if (method === "POST" && !itemId) {
      const body = await readJson(req);
      if (!body.title || typeof body.title !== "string") {
        json(res, 400, { error: "missing 'title'" });
        return true;
      }
      const { items } = await loadActivities(vfs, root);
      const activity = createActivity(body, crypto.randomUUID(), nowIso);
      await saveActivities(vfs, root, upsertById(items, activity));
      fireChange();
      json(res, 201, activity);
      return true;
    }
    if ((method === "PATCH" || method === "DELETE") && itemId) {
      const { items } = await loadActivities(vfs, root);
      const current = items.find((a) => a.id === itemId);
      if (!current) {
        json(res, 404, { error: "activity not found" });
        return true;
      }
      if (method === "PATCH") {
        const next = applyActivityUpdate(current, await readJson(req), nowIso);
        await saveActivities(vfs, root, upsertById(items, next));
        fireChange();
        json(res, 200, next);
      } else {
        await saveActivities(vfs, root, removeById(items, itemId).items);
        fireChange();
        json(res, 200, { ok: true });
      }
      return true;
    }
  }

  if (family === "routines") {
    if (method === "GET" && !itemId) {
      json(res, 200, await loadRoutines(vfs, root));
      return true;
    }
    if (method === "POST" && !itemId) {
      const body = await readJson(req);
      for (const field of ["name", "prompt", "schedule"]) {
        if (!body[field] || typeof body[field] !== "string") {
          json(res, 400, { error: `missing '${field}'` });
          return true;
        }
      }
      // Reject a bad cron NOW — otherwise the routine saves and silently never
      // fires (the scheduler would skip it forever, with no signal to the user).
      const scheduleErr = validateSchedule(body.schedule, body.timezone);
      if (scheduleErr) {
        json(res, 400, { error: `invalid schedule: ${scheduleErr}` });
        return true;
      }
      const { items } = await loadRoutines(vfs, root);
      const routine = createRoutine(body, crypto.randomUUID(), nowIso);
      await saveRoutines(vfs, root, upsertById(items, routine));
      fireChange();
      json(res, 201, routine);
      return true;
    }
    if ((method === "PATCH" || method === "DELETE") && itemId) {
      const { items } = await loadRoutines(vfs, root);
      const current = items.find((r) => r.id === itemId);
      if (!current) {
        json(res, 404, { error: "routine not found" });
        return true;
      }
      if (method === "PATCH") {
        const update = await readJson(req);
        const next = applyRoutineUpdate(current, update, nowIso);
        // A PATCH may change schedule and/or timezone — validate the result.
        const scheduleErr = validateSchedule(next.schedule, next.timezone);
        if (scheduleErr) {
          json(res, 400, { error: `invalid schedule: ${scheduleErr}` });
          return true;
        }
        await saveRoutines(vfs, root, upsertById(items, next));
        fireChange();
        json(res, 200, next);
      } else {
        await saveRoutines(vfs, root, removeById(items, itemId).items);
        fireChange();
        json(res, 200, { ok: true });
      }
      return true;
    }
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

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyRoutineUpdate,
  canonicalProviderId,
  createRoutine,
  getPreference,
  isValidTriggerBinding,
  loadConfig,
  loadLearnings,
  loadRoutineRuns,
  loadRoutines,
  removeById,
  saveConfig,
  saveLearnings,
  saveRoutines,
  upsertById,
  validateSchedule,
} from "@houston/domain";
import type {
  ActivityContributor,
  HoustonEvent,
  NewRoutine,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { hostProvider } from "../providers";
import type { Vfs } from "../vfs";
import { handleActivitiesData } from "./agent-data-activities";
import { json, readJson } from "./http";

// The cloud-layout root, kept as a convenience for cloud tests + callers that
// don't carry a WorkspacePaths instance. Production handlers use the injected
// `paths` so the local profile gets its own layout. See paths.ts.
export { workspaceRoot } from "../paths";

/**
 * Reject a provider pin naming a provider this host has never heard of —
 * otherwise the typo saves and every fired run errors. Validated through the
 * SAME canonical mapping the fire path uses (routinePin), so a Rust-era alias
 * ("claude", "codex") that still lives in a migrated routines.json round-trips
 * through an edit without a spurious 400. Model ids are validated at dispatch
 * (the catalog is the runtime's).
 */
const pinError = (body: Record<string, unknown>): string | null => {
  if (typeof body.provider !== "string" || !body.provider) return null;
  const canonical = canonicalProviderId(body.provider);
  return canonical && hostProvider(canonical)
    ? null
    : `unknown provider: ${body.provider}`;
};

/**
 * A routine has EXACTLY ONE wake mechanism: a cron `schedule` or an event
 * `trigger`. Reject "both" or "neither" (normalizeRoutines drops such an entry
 * on the next read, which would silently lose the write) and a malformed trigger
 * binding, so the caller learns immediately. Returns the reason, else null.
 */
const wakeMechanismError = (body: Record<string, unknown>): string | null => {
  const hasSchedule = typeof body.schedule === "string" && body.schedule !== "";
  const hasTrigger = body.trigger != null;
  if (hasSchedule === hasTrigger) {
    return "a routine needs exactly one of 'schedule' or 'trigger'";
  }
  if (hasTrigger && !isValidTriggerBinding(body.trigger)) {
    return "invalid 'trigger' binding";
  }
  return null;
};

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
    if (method === "GET" && !itemId) {
      json(res, 200, await loadRoutines(vfs, root));
      return true;
    }
    if (method === "POST" && !itemId) {
      const body = await readJson(req);
      for (const field of ["name", "prompt"]) {
        if (!body[field] || typeof body[field] !== "string") {
          json(res, 400, { error: `missing '${field}'` });
          return true;
        }
      }
      // Exactly one wake mechanism (a cron schedule OR an event trigger).
      const wakeErr = wakeMechanismError(body);
      if (wakeErr) {
        json(res, 400, { error: wakeErr });
        return true;
      }
      // The checks above proved name/prompt are non-empty strings and exactly
      // one wake mechanism is present.
      const input = body as unknown as NewRoutine;
      // Reject a bad cron NOW (schedule routines only) — otherwise the routine
      // saves and silently never fires (the scheduler would skip it forever,
      // with no signal to the user). Validate against the single account-wide
      // zone (HOU-470): there is no per-routine timezone, so a stray
      // body.timezone is not honored. Trigger routines have no cron to check.
      if (typeof input.schedule === "string") {
        const accountTz = await getPreference(
          vfs,
          ctx.workspace.id,
          "timezone",
        );
        const scheduleErr = validateSchedule(input.schedule, accountTz);
        if (scheduleErr) {
          json(res, 400, { error: `invalid schedule: ${scheduleErr}` });
          return true;
        }
      }
      const providerErr = pinError(body);
      if (providerErr) {
        json(res, 400, { error: providerErr });
        return true;
      }
      const { items } = await loadRoutines(vfs, root);
      const routine = createRoutine(
        input,
        crypto.randomUUID(),
        nowIso,
        createdBy,
      );
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
        // A PATCH may switch a routine to an event trigger; reject a malformed
        // binding before it is persisted (normalizeRoutines would drop it).
        if (update.trigger != null && !isValidTriggerBinding(update.trigger)) {
          json(res, 400, { error: "invalid 'trigger' binding" });
          return true;
        }
        const next = applyRoutineUpdate(current, update, nowIso, createdBy);
        // A PATCH may change the schedule; validate it against the account-wide
        // zone (HOU-470: no per-routine timezone). A trigger routine (or a PATCH
        // that switched to a trigger) has no cron to validate.
        if (typeof next.schedule === "string") {
          const accountTz = await getPreference(
            vfs,
            ctx.workspace.id,
            "timezone",
          );
          const scheduleErr = validateSchedule(next.schedule, accountTz);
          if (scheduleErr) {
            json(res, 400, { error: `invalid schedule: ${scheduleErr}` });
            return true;
          }
        }
        const providerErr = pinError(update);
        if (providerErr) {
          json(res, 400, { error: providerErr });
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

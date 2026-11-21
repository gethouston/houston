import { ACTING_AS_HEADER } from "../auth/acting";
import { TriggerCreatorMismatchError } from "../triggers/acting";
import { fireTriggerEvents, type TriggerEvent } from "../triggers/fire";
import {
  authorizeAgent,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

function parseEvent(raw: unknown): TriggerEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (
    typeof e.id !== "string" ||
    typeof e.routine_id !== "string" ||
    typeof e.trigger_slug !== "string"
  ) {
    return null;
  }
  return {
    id: e.id,
    routine_id: e.routine_id,
    trigger_slug: e.trigger_slug,
    payload: e.payload,
  };
}

defineRoute({
  group: "trigger-events",
  method: "POST",
  path: "/agents/:agentId/trigger-events",
  phase: "user",
  classification: "internal-control-plane",
  reason:
    "Server-to-server delivery: the control plane posts external events to the pod, never a client.",
  source: "packages/host/src/routes/trigger-events.ts",
  handler: async ({ deps, userId, params, req, res }) => {
    if (req.headers[ACTING_AS_HEADER] !== undefined)
      return json(res, 404, { error: "not found" });

    const authz = await authorizeAgent(deps, userId, params.agentId ?? "");
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });
    if (!deps.vfs)
      return json(res, 503, { error: "agent data not configured" });
    if (!deps.triggerLock)
      return json(res, 503, { error: "trigger delivery not configured" });
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);

    const body = await readJson(req);
    if (!Array.isArray(body.events))
      return json(res, 400, { error: "missing 'events' (array)" });
    const events: TriggerEvent[] = [];
    for (const raw of body.events) {
      const parsed = parseEvent(raw);
      if (!parsed)
        return json(res, 400, { error: "malformed event in 'events'" });
      events.push(parsed);
    }

    if (body.actingAs !== undefined && typeof body.actingAs !== "string")
      return json(res, 400, { error: "malformed 'actingAs'" });
    const actingAs = body.actingAs || undefined;

    try {
      const result = await fireTriggerEvents(
        {
          vfs: deps.vfs,
          paths: deps.paths ?? DEFAULT_PATHS,
          channels: deps.channels,
          events: deps.events,
          lock: deps.triggerLock,
          actingAs,
        },
        authz.workspace,
        authz.agent,
        events,
      );
      json(res, 200, result);
    } catch (err) {
      if (!(err instanceof TriggerCreatorMismatchError)) throw err;
      json(res, 400, { error: err.message, code: err.code });
    }
  },
});

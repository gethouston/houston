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

/** Validate one wire event, or null when malformed. */
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

/**
 * POST /agents/:agentId/trigger-events — the INTERNAL pod route (contract C9 #2):
 * the control plane (or the self-host process) delivers a batch of external
 * events for an agent. Not user-facing — it rides the same host-token trust
 * boundary as the other /agents/* routes (the bearer principal is resolved in
 * server.ts; a managed pod's caller presents the pod token). Matches BEFORE the
 * generic per-agent runtime dispatch, which has no trigger routes.
 *
 * All outcomes are HTTP 200 with a discriminated `result` (fired / busy /
 * no_routine); the caller uses it to mark the events delivered or retry.
 *
 * `phase: "user"`, not "agent", though the path names an agent: the acting-as
 * refusal below must answer BEFORE ownership is evaluated, so a proxied user
 * request gets the same flat 404 whoever owns the agent — an agent-phase route
 * would relay authorizeAgent's 403 first and confirm the agent to the caller
 * this route exists to turn away.
 */
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
    // Trust boundary (C9 security): trigger delivery rides the host token from
    // the control plane (or the self-host process calls fireTriggerEvents
    // in-process) — it NEVER arrives via the user-facing gateway proxy, which
    // stamps `x-houston-acting-as` on every request it forwards. So an acting-as
    // header on THIS route means a user request was proxied to a pod-internal
    // route; refuse it. Firing here would run a routine as its creator with a
    // caller-supplied, attacker-authored payload (prompt injection into a live
    // Autopilot turn). The gateway also 404s this path, so this is defense in
    // depth: the pod is the last line even if a proxy denylist regresses.
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

    // The creator's minted C2 token rides in the BODY, never the header: the
    // header is the proxied-user marker refused above, and the internal delivery
    // is the only caller of this route (same shape as routine-fires). Optional:
    // an older control plane, or the self-host process, delivers without it.
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

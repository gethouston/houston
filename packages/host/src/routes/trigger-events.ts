import type { IncomingMessage, ServerResponse } from "node:http";
import { ACTING_AS_HEADER } from "../auth/acting";
import {
  fireTriggerEvents,
  type TriggerEvent,
  type TriggerEventLock,
} from "../triggers/fire";
import {
  type AgentRouteDeps,
  authorizeAgent,
  channelFor,
  DEFAULT_PATHS,
  noChannel,
} from "./agent-authz";
import { json, readJson } from "./http";

export interface TriggerEventsDeps extends AgentRouteDeps {
  /** Cross-replica dedup lock (setNx + release). Absent → the route 503s. */
  triggerLock?: TriggerEventLock;
}

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
 * generic per-agent runtime dispatch. Returns true when it handled the request.
 *
 * All outcomes are HTTP 200 with a discriminated `result` (fired / busy /
 * no_routine); the caller uses it to mark the events delivered or retry.
 */
export async function handleTriggerEvents(
  deps: TriggerEventsDeps,
  userId: string,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(/^\/agents\/([^/]+)\/trigger-events$/);
  if (!match || method !== "POST") return false;

  // Trust boundary (C9 security): trigger delivery rides the host token from
  // the control plane (or the self-host process calls fireTriggerEvents
  // in-process) — it NEVER arrives via the user-facing gateway proxy, which
  // stamps `x-houston-acting-as` on every request it forwards. So an acting-as
  // header on THIS route means a user request was proxied to a pod-internal
  // route; refuse it. Firing here would run a routine as its creator with a
  // caller-supplied, attacker-authored payload (prompt injection into a live
  // Autopilot turn). The gateway also 404s this path, so this is defense in
  // depth: the pod is the last line even if a proxy denylist regresses.
  if (req.headers[ACTING_AS_HEADER] !== undefined) {
    json(res, 404, { error: "not found" });
    return true;
  }

  const agentId = decodeURIComponent(match[1] ?? "");
  const authz = await authorizeAgent(deps, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  if (!deps.triggerLock) {
    json(res, 503, { error: "trigger delivery not configured" });
    return true;
  }
  const channel = channelFor(deps, authz.workspace);
  if (!channel) {
    noChannel(res, authz.workspace.runtime);
    return true;
  }

  const body = await readJson(req);
  if (!Array.isArray(body.events)) {
    json(res, 400, { error: "missing 'events' (array)" });
    return true;
  }
  const events: TriggerEvent[] = [];
  for (const raw of body.events) {
    const parsed = parseEvent(raw);
    if (!parsed) {
      json(res, 400, { error: "malformed event in 'events'" });
      return true;
    }
    events.push(parsed);
  }

  const result = await fireTriggerEvents(
    {
      vfs: deps.vfs,
      paths: deps.paths ?? DEFAULT_PATHS,
      channels: deps.channels,
      events: deps.events,
      lock: deps.triggerLock,
    },
    authz.workspace,
    authz.agent,
    events,
  );
  json(res, 200, result);
  return true;
}

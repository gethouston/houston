import type { ServerResponse } from "node:http";
import type { TriggerStateStore } from "../triggers/state-store";
import { type AgentRouteDeps, authorizeAgent } from "./agent-authz";
import { json } from "./http";

export interface TriggerStatusDeps extends AgentRouteDeps {
  /** Self-host provisioning state; absent → the route 404s (feature off here). */
  triggerState?: TriggerStateStore;
}

/**
 * GET /agents/:agentId/trigger-status (contract C9 #4) — the routine editor's
 * badge feed: each trigger routine's health so a paused/errored automation is
 * never a silent no-op. Self-host serves it straight from the reconciler's state
 * store; managed cloud serves the equivalent from the gateway (this route is
 * absent on a pod, where `triggerState` is unset → 404). A user-`disabled`
 * routine carries no problem and is intentionally omitted (the routine's own
 * `enabled: false` already tells the UI it is off).
 */
export async function handleTriggerStatus(
  deps: TriggerStatusDeps,
  userId: string,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(/^\/agents\/([^/]+)\/trigger-status$/);
  if (!match || method !== "GET") return false;

  if (!deps.triggerState) {
    json(res, 404, { error: "triggers not supported by this deployment" });
    return true;
  }
  const agentId = decodeURIComponent(match[1] ?? "");
  const authz = await authorizeAgent(deps, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }

  const state = await deps.triggerState.get(authz.agent.id);
  const items = Object.entries(state)
    .filter(([, entry]) => entry.status !== "disabled")
    .map(([routine_id, entry]) => ({
      routine_id,
      status: entry.status,
      ...(entry.detail ? { detail: entry.detail } : {}),
    }));
  json(res, 200, { items });
  return true;
}

import type { Activity, TurnMode } from "@houston/protocol";
import { type HttpScope, httpRequest } from "../http";

/**
 * Sets how an agent works in one mission's chat. Every later message in that
 * mission runs in this mode unless the message names its own.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The mission to change, by the id listActivities returns.
 * @param mode "execute" (Ask first: does the work and asks before sensitive
 *   actions), "plan" (Planner: writes a plan to approve and changes nothing)
 *   or "auto" (Autopilot: finishes on its own and never stops to ask).
 * @assistant group:missions
 * @assistant unconfirmed: Changes how the agent works in a chat the person owns; nothing already done changes, and the mode is switched back the same way.
 */
export async function setMissionMode(
  scope: HttpScope,
  agentId: string,
  id: string,
  mode: TurnMode,
): Promise<Activity> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ mode }) },
  );
  return (await res.json()) as Activity;
}

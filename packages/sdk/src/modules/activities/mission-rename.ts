import type { Activity } from "@houston/protocol";
import { type HttpScope, httpRequest } from "../http";

/**
 * Renames a mission on an agent's board.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The mission to rename, by the id listActivities returns.
 * @param title The mission's new title, in the user's own words.
 * @assistant group:missions
 * @assistant unconfirmed: Retitles a card on the person's own board; what the mission did is untouched, and the title is changed back the same way.
 */
export async function renameMission(
  scope: HttpScope,
  agentId: string,
  id: string,
  title: string,
): Promise<Activity> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
  return (await res.json()) as Activity;
}

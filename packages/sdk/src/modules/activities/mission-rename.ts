/**
 * The mission rename: the ONE field a person edits on a mission card.
 *
 * It issues the same `PATCH /agents/:id/activities/:id` {@link updateActivity}
 * does, but with the title pinned as a body FIELD rather than carried inside an
 * open `ActivityUpdate`. That is the whole point of the separate function: the
 * derived operation can express nothing but a title, so the in-app assistant
 * gets the board edit a person actually performs without also getting the
 * lineage the runtime owns (session keys, routine run ids, the pending
 * interaction that authors an approval card) or a second, guard-free path to a
 * status move — that one belongs to the coordinator's `update_mission_status`
 * tool, which refuses a running mission and forwards cross-pod.
 *
 * `updateActivity` stays exactly as it is: wide, hidden, and the app's.
 *
 * It issues the request itself rather than delegating to `updateActivity`: the
 * catalog's route is read off the annotated function's OWN body
 * (`scripts/assistant-catalog/assistant-route.ts`), so a one-line delegation
 * here would leave this operation with no derivable route and the assistant
 * with no way to perform it.
 */

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

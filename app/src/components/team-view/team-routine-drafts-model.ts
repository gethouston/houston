import type { Activity, Routine } from "@houston-ai/engine-client";
import { findDraftSetupActivities } from "../../lib/routine-chat-setup.ts";
import type { Agent } from "../../lib/types.ts";
import { teamRoutineKey } from "./team-routines-model.ts";

/**
 * Turning several agents' half-built routines into rows of ONE list.
 *
 * A routine that is still being set up in chat exists only as an unclaimed
 * setup ACTIVITY — it is not a routine yet, so no routines read can see it.
 * The list has to carry those drafts as their own resumable rows, or a routine
 * started from this surface disappears the moment the person looks away from
 * its chat, under a grid still claiming "nothing runs on its own yet".
 *
 * The rule that finds a draft is the SHARED one
 * (`findDraftSetupActivities` — current and legacy sentinels, unclaimed,
 * unarchived), so the two surfaces can never disagree about what a draft is.
 * Only the keying is new: activity ids are unique per AGENT, so rows are
 * namespaced with the same {@link teamRoutineKey} the routine rows use.
 *
 * Pure and DOM-free, unit tested in `app/tests/team-routine-drafts-model.test.ts`.
 */

/** One team agent's answer to the two reads a draft row is derived from. */
export interface TeamRoutineDraftsEntry {
  agent: Agent;
  /** `undefined` while that agent's activity query is loading or failed. */
  activities: Activity[] | undefined;
  /** `undefined` while that agent's routines query is loading or failed. */
  routines: Routine[] | undefined;
}

export interface TeamRoutineDraftsList {
  /** Every scoped agent's drafts as ONE list, each row's id namespaced. */
  drafts: { id: string }[];
  /** The agent behind each draft row key. */
  ownerOf: Record<string, Agent>;
  /** The activity id each draft row key stands for, on the owning agent. */
  activityIdOf: Record<string, string>;
}

/**
 * Merge the entries into the draft rows the grid renders above the routines.
 *
 * Order is the team's own agent order, then each agent's activity order. There
 * is nothing to sort by: a draft has no name and no schedule, only the chat
 * behind it.
 */
export function aggregateTeamRoutineDrafts(
  entries: TeamRoutineDraftsEntry[],
): TeamRoutineDraftsList {
  const drafts: { id: string }[] = [];
  const ownerOf: Record<string, Agent> = {};
  const activityIdOf: Record<string, string> = {};

  for (const { agent, activities, routines } of entries) {
    for (const activity of findDraftSetupActivities(activities, routines)) {
      const key = teamRoutineKey(agent.id, activity.id);
      drafts.push({ id: key });
      ownerOf[key] = agent;
      activityIdOf[key] = activity.id;
    }
  }

  return { drafts, ownerOf, activityIdOf };
}

import type { CreatedMission } from "../../lib/created-mission-handoff.ts";
import type { AgentHomeConversation } from "./agents-home-model.ts";

/**
 * Whether the published mission target is the one just created for this
 * agent (its first day, started from its own phone screen). The create
 * publishes before the sweep lists the new mission, so this is what lets the
 * list open it without waiting for the row.
 */
export function isCreatedMissionOf(
  created: Pick<CreatedMission, "activityId" | "agentPath"> | null,
  pendingId: string | null,
  agentPath: string,
): pendingId is string {
  return (
    pendingId !== null &&
    created !== null &&
    created.activityId === pendingId &&
    created.agentPath === agentPath
  );
}

/** What the task list does with a published "open this task" target. */
export type DrillInTargetStep = "open" | "clear" | "wait";

/**
 * The phone's answer to a published task target (`activityPanelId`: a
 * notification, the command palette, a created agent's first-day task), read
 * by the employee's task list, the one phone surface that opens tasks.
 *
 * Only a task the sweep names as THIS employee's, or the one just created for
 * it, opens here, archived or not: a target published a beat before the nav
 * reaches its own employee must not open on the list the user is leaving. A
 * pushed chat is never replaced by another one; a target whose chat is
 * already that pushed chat is consumed.
 */
export function drillInMissionTarget(input: {
  pendingId: string | null;
  rows: readonly Pick<AgentHomeConversation, "id" | "agent_path">[] | undefined;
  agentPath: string;
  /** The mission just created, as the create handoff published it. */
  created?: Pick<CreatedMission, "activityId" | "agentPath"> | null;
  /** The pushed chat's mission, when a chat is up. */
  chatMissionId: string | null;
  chatOpen: boolean;
}): DrillInTargetStep {
  if (input.pendingId === null) return "wait";
  if (input.chatOpen)
    return input.chatMissionId === input.pendingId ? "clear" : "wait";
  if (
    isCreatedMissionOf(input.created ?? null, input.pendingId, input.agentPath)
  )
    return "open";
  const row = input.rows?.find((r) => r.id === input.pendingId);
  return row?.agent_path === input.agentPath ? "open" : "wait";
}

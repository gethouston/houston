/**
 * Board activities — backed by the SAME `.houston/activity/activity.json` the
 * board reads, so a chat turn flipping a card's status shows up on the board.
 */

import type { Activity, ActivityUpdate } from "@houston/protocol";
import { ACTIVITY_PATH, emitDomain, fileKey, ISO, state } from "./state-store";

export function listActivities(agentId: string): Activity[] {
  try {
    return JSON.parse(
      state.files.get(fileKey(agentId, ACTIVITY_PATH)) || "[]",
    ) as Activity[];
  } catch {
    return [];
  }
}
function setActivities(agentId: string, items: Activity[]): void {
  state.files.set(fileKey(agentId, ACTIVITY_PATH), JSON.stringify(items));
  emitDomain("ActivityChanged", agentId);
}
export function createActivity(
  agentId: string,
  input: Partial<Activity>,
): Activity {
  const activity: Activity = {
    // The real host honors a client-generated id (HOU-693) — mirror it so
    // optimistic flows (warming missions, the welcome mission) round-trip.
    id: input.id ?? `act-${++state.activitySeq}`,
    title: input.title ?? "Untitled",
    description: input.description ?? "",
    status: input.status ?? "running",
    session_key: input.session_key,
    updated_at: ISO,
  };
  setActivities(agentId, [...listActivities(agentId), activity]);
  return activity;
}
export function updateActivity(
  agentId: string,
  id: string,
  updates: ActivityUpdate,
): Activity | null {
  const items = listActivities(agentId);
  const activity = items.find((a) => a.id === id);
  if (!activity) return null;
  const { pending_interaction, ...rest } = updates;
  Object.assign(activity, rest, { updated_at: ISO });
  // The app clears a persisted interaction by PATCHing `pending_interaction:
  // null`. DELETE the key (never store null) so it can't linger or fail the
  // `isPendingInteraction` shape guard on a later read; a value records it.
  if ("pending_interaction" in updates) {
    if (pending_interaction) activity.pending_interaction = pending_interaction;
    else delete activity.pending_interaction;
  }
  setActivities(agentId, items);
  return activity;
}
/**
 * Clear the pending interaction of the activity bound to this conversation —
 * matched by `session_key` or the derived `activity-<id>` key, the same rule the
 * app's activity-status writer uses — mirroring the runtime dismiss passthrough.
 * No-op when no activity matches or it had none.
 */
export function clearActivityInteraction(
  agentId: string,
  sessionKey: string,
): void {
  const items = listActivities(agentId);
  const activity = items.find(
    (a) => a.session_key === sessionKey || `activity-${a.id}` === sessionKey,
  );
  if (!activity?.pending_interaction) return;
  delete activity.pending_interaction;
  activity.updated_at = ISO;
  setActivities(agentId, items);
}
export function deleteActivity(agentId: string, id: string): void {
  setActivities(
    agentId,
    listActivities(agentId).filter((a) => a.id !== id),
  );
}

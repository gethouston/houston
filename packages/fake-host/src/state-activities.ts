/**
 * Board activities — backed by the SAME `.houston/activity/activity.json` the
 * board reads, so a chat turn flipping a card's status shows up on the board.
 */

import type { Activity } from "@houston/protocol";
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
  updates: Partial<Activity>,
): Activity | null {
  const items = listActivities(agentId);
  const activity = items.find((a) => a.id === id);
  if (!activity) return null;
  Object.assign(activity, updates, { updated_at: ISO });
  setActivities(agentId, items);
  return activity;
}
export function deleteActivity(agentId: string, id: string): void {
  setActivities(
    agentId,
    listActivities(agentId).filter((a) => a.id !== id),
  );
}

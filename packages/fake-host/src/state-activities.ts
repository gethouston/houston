/**
 * Board activities — backed by the SAME `.houston/activity/activity.json` the
 * board reads, so a chat turn flipping a card's status shows up on the board.
 */

import {
  type Activity,
  type ActivityUpdate,
  resolveInteractionPatch,
} from "@houston/protocol";
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
    // Teams attribution (created_by / contributors) and the @mention aggregate
    // are server-stamped in the real host; accept them off the POST body so an
    // e2e spec can seed an attributed or mentioned mission. Explicit keys only
    // — an unknown field is still dropped.
    ...(input.created_by !== undefined && { created_by: input.created_by }),
    ...(input.contributors !== undefined && {
      contributors: input.contributors,
    }),
    ...(input.mentioned !== undefined && { mentioned: input.mentioned }),
    // The agent-started marker (PRODUCT-1244) is stamped by the real host's
    // missions route, never by a client POST — accept it here for the same
    // reason as the attribution keys: an e2e needs to seed a child mission.
    ...(input.origin_session_key !== undefined && {
      origin_session_key: input.origin_session_key,
    }),
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
  // Same rule as the real host (`applyActivityUpdate` in @houston/domain),
  // resolved through the one shared helper: `null` DELETES the key (never store
  // null, or a later read fails the shape guard), a valid object records it, and
  // an absent or malformed one leaves it alone EXCEPT on a move to Done, which
  // strips the blocking steps and keeps the clean-finish offers.
  const outcome = resolveInteractionPatch({
    patched: pending_interaction,
    stored: activity.pending_interaction,
    status: updates.status,
  });
  if (outcome.kind === "set")
    activity.pending_interaction = outcome.interaction;
  else if (outcome.kind === "clear") delete activity.pending_interaction;
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

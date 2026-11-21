import { addressesMission } from "@houston/domain/conversation-keys";
import {
  type Activity,
  type ActivityStamp,
  type ActivityUpdate,
  isMissionStarter,
  normalizeTurnMode,
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
    id: input.id ?? `act-${++state.activitySeq}`,
    title: input.title ?? "Untitled",
    description: input.description ?? "",
    status: input.status ?? "running",
    session_key: input.session_key,
    updated_at: ISO,
    ...(input.created_by !== undefined && { created_by: input.created_by }),
    ...(input.contributors !== undefined && {
      contributors: input.contributors,
    }),
    ...(input.mentioned !== undefined && { mentioned: input.mentioned }),
    ...(input.agent !== undefined && { agent: input.agent }),
    ...(input.mode !== undefined && { mode: normalizeTurnMode(input.mode) }),
    ...(input.origin_session_key !== undefined && {
      origin_session_key: input.origin_session_key,
    }),
    ...(input.last_message_at !== undefined && {
      last_message_at: input.last_message_at,
    }),
    ...(isMissionStarter(input.started_by) && {
      started_by: input.started_by,
    }),
  };
  setActivities(agentId, [...listActivities(agentId), activity]);
  return activity;
}
export function updateActivity(
  agentId: string,
  id: string,
  updates: ActivityUpdate,
  stamp?: ActivityStamp,
): Activity | null {
  const items = listActivities(agentId);
  const activity = items.find((a) => a.id === id);
  if (!activity) return null;
  const { pending_interaction, ...rest } = updates;
  activity.last_message_at ??= activity.updated_at ?? ISO;
  Object.assign(activity, rest, { updated_at: ISO });
  if (stamp === "last_message") activity.last_message_at = ISO;
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
export function clearActivityInteraction(
  agentId: string,
  sessionKey: string,
): void {
  const items = listActivities(agentId);
  const activity = items.find((a) => addressesMission(a, sessionKey));
  if (!activity?.pending_interaction) return;
  delete activity.pending_interaction;
  activity.last_message_at ??= activity.updated_at ?? ISO;
  activity.updated_at = ISO;
  setActivities(agentId, items);
}
export function deleteActivity(agentId: string, id: string): void {
  setActivities(
    agentId,
    listActivities(agentId).filter((a) => a.id !== id),
  );
}

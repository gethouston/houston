import type { KanbanItem } from "@houston-ai/board";

type MissionControlSessionItem = Pick<KanbanItem, "id" | "metadata">;

function metadataString(
  item: MissionControlSessionItem,
  key: string,
): string | undefined {
  const value = item.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function missionControlSessionKey(
  item: MissionControlSessionItem,
): string {
  return metadataString(item, "sessionKey") ?? `activity-${item.id}`;
}

export function missionControlSessionKeyForId(
  items: MissionControlSessionItem[],
  activityId: string,
): string {
  const item = items.find((candidate) => candidate.id === activityId);
  return item ? missionControlSessionKey(item) : `activity-${activityId}`;
}

export function missionControlAgentPathForSession(
  items: MissionControlSessionItem[],
  sessionKey: string,
): string | undefined {
  const item = items.find(
    (candidate) => missionControlSessionKey(candidate) === sessionKey,
  );
  return item ? metadataString(item, "agentPath") : undefined;
}

import type { CreatedMission } from "../../lib/created-mission-handoff.ts";
import type { AgentHomeConversation } from "./agents-home-model.ts";

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

export type DrillInTargetStep = "open" | "clear" | "wait";

export function drillInMissionTarget(input: {
  pendingId: string | null;
  rows: readonly Pick<AgentHomeConversation, "id" | "agent_path">[] | undefined;
  agentPath: string;
  created?: Pick<CreatedMission, "activityId" | "agentPath"> | null;
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

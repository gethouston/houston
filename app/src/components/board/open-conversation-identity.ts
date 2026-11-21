import type { KanbanItem } from "@houston-ai/board";
import type { CreatedMission } from "../../lib/created-mission-handoff";

export interface OpenConversationIdentity {
  activityId: string;
  sessionKey: string;
  agentPath: string | null;
}

export interface ResolveOpenConversationArgs {
  selectedId: string | null;
  selectedItem: Pick<KanbanItem, "id" | "metadata"> | null;
  created: CreatedMission | null;
  lastResolved: OpenConversationIdentity | null;
}

export function resolveOpenConversation({
  selectedId,
  selectedItem,
  created,
  lastResolved,
}: ResolveOpenConversationArgs): OpenConversationIdentity | null {
  if (!selectedId) return null;
  if (selectedItem) {
    const sessionKey = selectedItem.metadata?.sessionKey;
    const agentPath = selectedItem.metadata?.agentPath;
    return {
      activityId: selectedId,
      sessionKey:
        typeof sessionKey === "string" && sessionKey.length > 0
          ? sessionKey
          : `activity-${selectedId}`,
      agentPath: typeof agentPath === "string" ? agentPath : null,
    };
  }
  if (created && created.activityId === selectedId) {
    return {
      activityId: selectedId,
      sessionKey: created.sessionKey,
      agentPath: created.agentPath,
    };
  }
  if (lastResolved && lastResolved.activityId === selectedId) {
    return lastResolved;
  }
  return null;
}

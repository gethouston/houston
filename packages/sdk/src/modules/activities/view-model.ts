import { addressesMission, missionConversationKey } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import { missionStartedBy } from "./started-by";
import type { ActivityItem } from "./types";

export function sessionKeyOf(a: Activity): string {
  return missionConversationKey(a);
}

export function matchesActivitySessionKey(
  a: Activity,
  sessionKey: string,
): boolean {
  return addressesMission(a, sessionKey);
}

export function toActivityItem(a: Activity): ActivityItem {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    sessionKey: sessionKeyOf(a),
    startedBy: missionStartedBy(a),
    ...(a.description ? { description: a.description } : {}),
    ...(a.last_message_at !== undefined
      ? { lastMessageAt: a.last_message_at }
      : {}),
    ...(a.updated_at !== undefined ? { updatedAt: a.updated_at } : {}),
    ...(a.routine_id !== undefined ? { routineId: a.routine_id } : {}),
    ...(a.origin_session_key !== undefined
      ? { originSessionKey: a.origin_session_key }
      : {}),
    ...(a.agent !== undefined ? { agent: a.agent } : {}),
    ...(a.worktree_path !== undefined ? { worktreePath: a.worktree_path } : {}),
    ...(a.provider !== undefined ? { provider: a.provider } : {}),
    ...(a.model !== undefined ? { model: a.model } : {}),
    ...(a.mode !== undefined ? { mode: a.mode } : {}),
  };
}

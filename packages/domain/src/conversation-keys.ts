import type { Activity, Routine } from "@houston/protocol";

export type RecordConversationKind = "mission" | "routine";

const PREFIXES: Record<RecordConversationKind, string> = {
  mission: "activity-",
  routine: "routine-",
};

const fold = (conversationId: string): string => conversationId.toLowerCase();

export function missionConversationId(missionId: string): string {
  return `${PREFIXES.mission}${missionId}`;
}

export function missionConversationKey(
  activity: Pick<Activity, "id" | "session_key">,
): string {
  return activity.session_key ?? missionConversationId(activity.id);
}

export function addressesMission(
  activity: Pick<Activity, "id" | "session_key">,
  conversationId: string,
): boolean {
  const asked = fold(conversationId);
  return (
    (activity.session_key !== undefined &&
      fold(activity.session_key) === asked) ||
    fold(missionConversationId(activity.id)) === asked
  );
}

export function routineConversationId(routine: Routine, runId: string): string {
  return routine.chat_mode === "per_run"
    ? `${PREFIXES.routine}${routine.id}-${runId}`
    : `${PREFIXES.routine}${routine.id}`;
}

export function recordConversationKind(
  conversationId: string,
): RecordConversationKind | null {
  const asked = fold(conversationId);
  for (const [kind, prefix] of Object.entries(PREFIXES)) {
    if (asked.startsWith(prefix)) return kind as RecordConversationKind;
  }
  return null;
}

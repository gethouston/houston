import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { ClaudeSessionDeps } from "./session-deps";

export function resumeFill(
  measured: number | undefined,
  deps: Pick<
    ClaudeSessionDeps,
    "conversationId" | "sessionsStore" | "recordedContextTokens"
  >,
  compactions: CompactionCheckpoints,
): number | undefined {
  if (measured !== undefined) return measured;
  const { conversationId: id, sessionsStore } = deps;
  if (compactions.read(id) || !sessionsStore.getSessionId(id)) return undefined;
  return deps.recordedContextTokens?.();
}

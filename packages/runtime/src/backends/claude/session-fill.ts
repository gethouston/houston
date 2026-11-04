import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { ClaudeSessionDeps } from "./session-deps";

/**
 * The fill the autocompact check reads (session/exec-turn.ts). A session the
 * standing server rebuilt after a restart has measured nothing yet, so it
 * reports the fill its last reply recorded, but only when the next prompt
 * resumes that SDK session: a fresh one (a backend switch, a routine reset,
 * edit-and-resend) or one armed with a compaction summary sends far less, and
 * compacting it would be refused ("nothing to compact").
 */
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

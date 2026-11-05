import { effectiveModelWindow } from "@houston/protocol/model-windows";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../backends/types";
import { config } from "../config";
import { getHistory } from "../store/conversations";
import { recordedContextFill } from "./recorded-context-fill";
import { replayForConversation } from "./routine-replay";

/**
 * Open a conversation's session on the standing server. Every build goes
 * through here (the first one, a rebuild after eviction or a rotated token, a
 * backend or mode switch, a routine's reset), because a session that resumes
 * the conversation has measured nothing yet and must size its first request
 * from the fill the last reply recorded.
 */
export function openConversationSession(
  backend: HarnessBackend,
  options: Omit<
    CreateSessionOptions,
    "recordedContextTokens" | "freshRetryPromptPrefix"
  >,
): Promise<HarnessSession> {
  const { conversationId, model } = options;
  return backend.createSession({
    ...options,
    // The recent page holds the last reply; the whole history could mean
    // reading archive segments.
    recordedContextTokens: () =>
      recordedContextFill(
        getHistory(conversationId, { limit: 50 })?.messages ?? [],
      ),
    // Claude reruns a turn as a fresh session when its resume fails, and that
    // session knows only what this replay carries. Built only then.
    freshRetryPromptPrefix: () => {
      const messages = getHistory(conversationId)?.messages ?? [];
      // The turn in flight appended its message before it prompted, and the
      // rerun sends that text after the replay itself.
      const inFlight = messages.findLast((m) => m.role === "user")?.turnId;
      return (
        replayForConversation({
          conversationId,
          messages,
          currentTurnId: inFlight ?? "",
          dirs: config,
          windowTokens: effectiveModelWindow(
            model.provider,
            model.id,
            model.contextWindow,
            0,
          ),
        })?.text ?? ""
      );
    },
  });
}

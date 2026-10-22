import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../backends/types";
import { getHistory } from "../store/conversations";
import { recordedContextFill } from "./recorded-context-fill";

/**
 * Open a conversation's session on the standing server. Every build goes
 * through here (the first one, a rebuild after eviction or a rotated token, a
 * backend or mode switch, a routine's reset), because a session that resumes
 * the conversation has measured nothing yet and must size its first request
 * from the fill the last reply recorded.
 */
export function openConversationSession(
  backend: HarnessBackend,
  options: Omit<CreateSessionOptions, "recordedContextTokens">,
): Promise<HarnessSession> {
  const { conversationId } = options;
  return backend.createSession({
    ...options,
    // The recent page holds the last reply; the whole history could mean
    // reading archive segments.
    recordedContextTokens: () =>
      recordedContextFill(
        getHistory(conversationId, { limit: 50 })?.messages ?? [],
      ),
  });
}

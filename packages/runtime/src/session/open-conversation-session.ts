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
    recordedContextTokens: () =>
      recordedContextFill(
        getHistory(conversationId, { limit: 50 })?.messages ?? [],
      ),
    freshRetryPromptPrefix: () => {
      const messages = getHistory(conversationId)?.messages ?? [];
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

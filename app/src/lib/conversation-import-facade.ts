import type {
  ConversationImportRequest,
  ConversationImportResult,
} from "@houston/wire-types";
import { getEngine } from "./engine";
import { engineCall, surfaceEngineError } from "./tauri";

export const tauriConversationImports = {
  send: (
    agentPath: string,
    conversationId: string,
    request: ConversationImportRequest,
  ) =>
    engineCall<ConversationImportResult>("import_conversation", () =>
      getEngine().importConversationMessages(
        agentPath,
        conversationId,
        request,
      ),
    ),
  retryOwed: (agentPath: string) =>
    engineCall<void>("retry_conversation_imports", async () => {
      const failures =
        await getEngine().retryPendingConversationImports(agentPath);
      for (const err of failures)
        await surfaceEngineError("import_conversation", err);
    }),
};

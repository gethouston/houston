import type { DismissInteractionOutcome } from "@houston/sdk";
import type {
  ConversationImportRequest,
  ConversationImportResult,
} from "@houston/wire-types";
import { DEFAULT_AGENT_PATH } from "../synthetic";
import { stopUnsentTurn, truncateConversationVm } from "../turn-stream";
import { setActivityStatus } from "./activity-status";
import { runtimeScope } from "./chat-scope";
import { importConversation, retryPendingImports } from "./conversation-import";
import type { BaseCtor } from "./mixin";

export function ChatControlsMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatControls extends Base {
    async cancelSession(agentPath: string, sessionKey: string) {
      const finish = stopUnsentTurn(agentPath, sessionKey);
      let cancelled: boolean;
      try {
        ({ cancelled } = await this.ctx.sdk.turns.cancel(
          sessionKey,
          runtimeScope(this.ctx, agentPath),
        ));
      } finally {
        finish?.();
      }
      if (finish) return { cancelled: true };
      if (cancelled !== true) {
        await setActivityStatus(
          this.ctx,
          agentPath,
          sessionKey,
          "needs_you",
          null,
        );
      }
      return { cancelled: cancelled === true };
    }

    setLiveTurnMode(
      agentPath: string,
      conversationId: string,
      mode: "execute" | "plan" | "auto",
    ): Promise<{ ok: boolean; applied: boolean }> {
      return this.ctx.sdk.turns.setMode(
        conversationId,
        runtimeScope(this.ctx, agentPath),
        mode,
      );
    }

    dismissInteraction(
      agentPath: string,
      conversationId: string,
    ): Promise<DismissInteractionOutcome> {
      return this.ctx.sdk.turns.dismissInteraction(
        conversationId,
        runtimeScope(this.ctx, agentPath),
      );
    }

    async truncateConversation(
      agentPath: string,
      sessionKey: string,
      turnId: string,
    ): Promise<void> {
      const path = agentPath || DEFAULT_AGENT_PATH;
      await this.ctx.sdk.turns.truncate(
        sessionKey,
        runtimeScope(this.ctx, path),
        turnId,
      );
      truncateConversationVm(path, sessionKey, turnId);
    }

    importConversationMessages(
      agentPath: string,
      conversationId: string,
      request: ConversationImportRequest,
    ): Promise<ConversationImportResult> {
      return importConversation(this.ctx, agentPath, conversationId, request);
    }

    retryPendingConversationImports(agentPath: string): Promise<unknown[]> {
      return retryPendingImports(this.ctx, agentPath);
    }
  }
  return ChatControls;
}

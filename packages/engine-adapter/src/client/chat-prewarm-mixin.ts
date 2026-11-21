import type { ComposerDraft, PrewarmCapabilities } from "@houston/sdk";
import type {
  ConversationPrewarmAnswer,
  ConversationPrewarmInput,
} from "@houston/wire-types";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

const prewarmPath = (agentPath: string, conversationId: string): string =>
  `/v1/agents/${encodeURIComponent(agentPath)}/conversations/${encodeURIComponent(conversationId)}/prewarm`;

export function ChatPrewarmMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatPrewarm extends Base {
    prewarmConversation(
      agentPath: string,
      conversationId: string,
      input?: ConversationPrewarmInput,
    ): Promise<ConversationPrewarmAnswer> {
      return viaSdk(prewarmPath(agentPath, conversationId), () =>
        this.ctx.sdk.turns.prewarm(conversationId, agentPath, input),
      );
    }

    draftChanged(
      draft: ComposerDraft,
      capabilities: PrewarmCapabilities,
    ): Promise<void> {
      return viaSdk(
        prewarmPath(draft.agentId, draft.conversationId ?? ""),
        () => this.ctx.sdk.turns.draftChanged(draft, capabilities),
      );
    }

    claimNewConversationId(draftKey: string): string {
      return this.ctx.sdk.turns.claimNewConversationId(draftKey);
    }
  }
  return ChatPrewarm;
}

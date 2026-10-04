import type { ComposerDraft, PrewarmCapabilities } from "@houston/sdk";
import type {
  ConversationPrewarmAnswer,
  ConversationPrewarmInput,
} from "@houston/wire-types";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** The path a prewarm for `agentPath` and `conversationId` issues. */
const prewarmPath = (agentPath: string, conversationId: string): string =>
  `/v1/agents/${encodeURIComponent(agentPath)}/conversations/${encodeURIComponent(conversationId)}/prewarm`;

/**
 * Readying the sandbox a composer's send will run in while the person types.
 * The route and the typing policy both live in the SDK
 * (`modules/turns/conversation-prewarm.ts`, `draft-prewarm.ts`); this binds
 * them. The agent path goes out as is: the route is the gateway's, and on the
 * hosted profile, the only one that serves it, an agent's path is its slug.
 */
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

    /**
     * Hand one composer keystroke to the SDK's typing policy. Rejects with the
     * prewarm request's failure as a `HoustonEngineError`, like every other
     * engine call. A new chat's id is minted inside the policy, so its path
     * names no conversation.
     */
    draftChanged(
      draft: ComposerDraft,
      capabilities: PrewarmCapabilities,
    ): Promise<void> {
      return viaSdk(
        prewarmPath(draft.agentId, draft.conversationId ?? ""),
        () => this.ctx.sdk.turns.draftChanged(draft, capabilities),
      );
    }

    /** The conversation id a new chat's first send must use. Never throws. */
    claimNewConversationId(draftKey: string): string {
      return this.ctx.sdk.turns.claimNewConversationId(draftKey);
    }
  }
  return ChatPrewarm;
}

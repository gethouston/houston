// The composer's half of warm-while-typing, with its collaborators passed in
// so it is node-testable directly (app/tests/composer-prewarm.test.ts).
// `composer-prewarm-facade.ts` binds the live engine, the capability snapshot
// and the report path. When to ask the gateway is the SDK's typing policy
// (`@houston/sdk/draft-prewarm`); this only says which draft the composer holds.

import type { Capabilities } from "@houston/engine-adapter";
import type { ComposerDraft } from "@houston/sdk";
import { NEW_CONVERSATION_KEY } from "../stores/drafts.ts";
import { type RejectionReporter, reportRejection } from "./report-rejection.ts";

/** Where the composer's send would go when its text changes. */
export interface ComposerTarget {
  /** The agent the send goes to. None means nothing to warm. */
  agentPath: string | null | undefined;
  /** This board's new-chat draft slot, as the draft store scopes it. */
  newConversationKey: string;
  provider?: string;
  model?: string;
}

/** The engine methods the composer prewarm binds. */
export interface ComposerPrewarmEngine {
  draftChanged(
    draft: ComposerDraft,
    capabilities: Capabilities | undefined,
  ): Promise<void>;
  claimNewConversationId(draftKey: string): string;
}

export interface ComposerPrewarmPorts {
  engine: () => ComposerPrewarmEngine;
  capabilities: () => Capabilities | undefined;
  report: RejectionReporter;
}

/**
 * The draft behind AIBoard's `onDraftChange(key, text)`. AIBoard names a new
 * chat's composer with the plain `new-conversation` literal and an open chat's
 * by its session key, which is also its conversation id. A new chat's draft
 * goes out under the scoped slot, the same key its first send claims the id
 * under.
 */
export function composerDraft(
  boardKey: string,
  text: string,
  target: ComposerTarget,
): ComposerDraft | null {
  if (!target.agentPath) return null;
  const isNewChat = boardKey === NEW_CONVERSATION_KEY;
  return {
    agentId: target.agentPath,
    draftKey: isNewChat ? target.newConversationKey : boardKey,
    ...(isNewChat ? {} : { conversationId: boardKey }),
    text,
    provider: target.provider,
    model: target.model,
  };
}

export function createComposerPrewarm(ports: ComposerPrewarmPorts) {
  return {
    /** One keystroke. Shows nothing; a failed prewarm is only reported. */
    draftChanged(boardKey: string, text: string, target: ComposerTarget): void {
      const draft = composerDraft(boardKey, text, target);
      if (!draft) return;
      reportRejection(
        ports.engine().draftChanged(draft, ports.capabilities()),
        "prewarm_conversation",
        ports.report,
      );
    },
    /** The id a new chat's first send in `draftKey` must use. */
    claimNewConversationId(draftKey: string): string {
      return ports.engine().claimNewConversationId(draftKey);
    },
  };
}

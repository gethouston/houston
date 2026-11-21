import type { Capabilities } from "@houston/engine-adapter";
import type { ComposerDraft } from "@houston/sdk";
import { NEW_CONVERSATION_KEY } from "../stores/drafts.ts";
import { type RejectionReporter, reportRejection } from "./report-rejection.ts";

export interface ComposerTarget {
  agentPath: string | null | undefined;
  newConversationKey: string;
  provider?: string;
  model?: string;
}

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
    draftChanged(boardKey: string, text: string, target: ComposerTarget): void {
      const draft = composerDraft(boardKey, text, target);
      if (!draft) return;
      reportRejection(
        ports.engine().draftChanged(draft, ports.capabilities()),
        "prewarm_conversation",
        ports.report,
      );
    },
    claimNewConversationId(draftKey: string): string {
      return ports.engine().claimNewConversationId(draftKey);
    },
  };
}

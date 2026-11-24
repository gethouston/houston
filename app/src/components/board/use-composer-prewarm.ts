import type { ComposerDraftStore } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import type { ComposerTarget } from "../../lib/composer-prewarm";
import { composerPrewarm } from "../../lib/composer-prewarm-facade";

/**
 * Warm-while-typing for a board's chat composer: wraps the draft store
 * AIBoard writes on every keystroke so the sandbox the send will run in starts
 * readying, and hands a new chat's first send the id that typing warmed.
 */
export function useComposerPrewarm(
  drafts: ComposerDraftStore,
  { agentPath, newConversationKey, provider, model }: ComposerTarget,
) {
  const draftStore = useMemo<ComposerDraftStore>(
    () => ({
      ...drafts,
      set: (key, text) => {
        drafts.set(key, text);
        composerPrewarm.draftChanged(key, text, {
          agentPath,
          newConversationKey,
          provider,
          model,
        });
      },
    }),
    [drafts, agentPath, newConversationKey, provider, model],
  );
  const claimNewConversationId = useCallback(
    () => composerPrewarm.claimNewConversationId(newConversationKey),
    [newConversationKey],
  );
  return { draftStore, claimNewConversationId };
}

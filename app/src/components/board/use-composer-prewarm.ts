import { useCallback } from "react";
import type { ComposerTarget } from "../../lib/composer-prewarm";
import { composerPrewarm } from "../../lib/composer-prewarm-facade";

/**
 * Warm-while-typing for a board's chat composer: wraps the draft setter
 * AIBoard calls on every keystroke so the sandbox the send will run in starts
 * readying, and hands a new chat's first send the id that typing warmed.
 */
export function useComposerPrewarm(
  onDraftChange: (key: string, text: string) => void,
  { agentPath, newConversationKey, provider, model }: ComposerTarget,
) {
  const handleDraftChange = useCallback(
    (key: string, text: string) => {
      onDraftChange(key, text);
      composerPrewarm.draftChanged(key, text, {
        agentPath,
        newConversationKey,
        provider,
        model,
      });
    },
    [onDraftChange, agentPath, newConversationKey, provider, model],
  );
  const claimNewConversationId = useCallback(
    () => composerPrewarm.claimNewConversationId(newConversationKey),
    [newConversationKey],
  );
  return { onDraftChange: handleDraftChange, claimNewConversationId };
}

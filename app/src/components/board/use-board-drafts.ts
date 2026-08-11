import { useCallback, useMemo } from "react";
import {
  boardDraftsView,
  NEW_CONVERSATION_KEY,
  newConversationDraftKey,
  useDraftStore,
} from "../../stores/drafts";
import { useUIStore } from "../../stores/ui";

/**
 * Composer draft persistence for the board, shared by both views. Exposes the
 * text-only draft map AIBoard expects and a setter that writes back to the
 * draft store, so what the user typed survives navigation between missions.
 *
 * AIBoard keys its new-mission composer with the plain "new-conversation"
 * literal, but the store scopes that draft per agent (HOU-730) — otherwise a
 * first message parked for a sleeping agent shows up in every other agent's
 * composer. This hook translates between the two on read and write.
 */
export function useBoardDrafts(newConversationScope?: string | null) {
  const rawDrafts = useDraftStore((s) => s.drafts);
  const scopedKey = newConversationDraftKey(newConversationScope);
  const drafts = useMemo(
    () => boardDraftsView(rawDrafts, scopedKey),
    [rawDrafts, scopedKey],
  );
  const onDraftChange = useCallback(
    (sessionKey: string, text: string) => {
      // In-app onboarding's guided email task: the first task is PREWRITTEN
      // and locked — the tutorial owns the new-conversation draft, so user
      // edits (and the board's own post-send clear) are ignored; the tutorial
      // clears the draft itself when its send step resolves
      // (use-guided-email-task.ts).
      if (
        sessionKey === NEW_CONVERSATION_KEY &&
        useUIStore.getState().tutorialComposerLock
      ) {
        return;
      }
      useDraftStore
        .getState()
        .setDraftText(
          sessionKey === NEW_CONVERSATION_KEY ? scopedKey : sessionKey,
          text,
        );
    },
    [scopedKey],
  );
  return { drafts, onDraftChange };
}

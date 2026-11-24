import type { ComposerDraftStore } from "@houston-ai/chat";
import { useMemo } from "react";
import {
  boardDraftKey,
  useDraftStore,
  useNewConversationDraftKey,
} from "../../stores/drafts";

/**
 * Composer draft persistence for the board, shared by both views: the draft
 * store AIBoard's composer reads and writes, so what the user typed survives
 * navigation between missions. The board holds the store, never the text, so
 * a keystroke re-renders the composer alone (the board and its message list
 * stay put).
 *
 * AIBoard keys its new-mission composer with the plain "new-conversation"
 * literal, but the store scopes that draft per agent (HOU-730) — otherwise a
 * first message parked for a sleeping agent shows up in every other agent's
 * composer. This hook translates between the two on read and write, and a
 * seeded open (`seedDraft`) reads and writes the seed's slot instead.
 */
export function useBoardDrafts(newConversationScope?: string | null) {
  const scopedKey = useNewConversationDraftKey(newConversationScope);
  const draftStore = useMemo<ComposerDraftStore>(
    () => ({
      get: (key) =>
        useDraftStore.getState().drafts[boardDraftKey(key, scopedKey)]?.text ??
        "",
      set: (key, text) =>
        useDraftStore
          .getState()
          .setDraftText(boardDraftKey(key, scopedKey), text),
      subscribe: useDraftStore.subscribe,
    }),
    [scopedKey],
  );
  return { draftStore, newConversationKey: scopedKey };
}

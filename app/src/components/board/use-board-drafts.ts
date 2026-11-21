import type { ComposerDraftStore } from "@houston-ai/chat";
import { useMemo } from "react";
import {
  boardDraftKey,
  useDraftStore,
  useNewConversationDraftKey,
} from "../../stores/drafts";

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

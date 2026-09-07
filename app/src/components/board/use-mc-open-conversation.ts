import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo, useRef } from "react";
import { useConversationVm } from "../../hooks/use-conversation-vm";
import { tauriChat } from "../../lib/tauri";
import {
  type OpenConversationIdentity,
  resolveOpenConversation,
} from "./open-conversation-identity";
import { useJustCreatedMission } from "./use-just-created-mission";

/**
 * WHICH conversation the cross-agent board has open, and its live feed.
 *
 * Two facts name it — the session key and the agent path — and on a
 * cross-agent board neither is implicit: the selected CARD carries both in its
 * metadata. Two cases have no card to read. A mission created on this board,
 * whose row the sweep has not returned: `useJustCreatedMission` holds its
 * identity for exactly that beat, so the panel that just opened never loses
 * the user's first message. And a card TRANSIENTLY absent from the list (a
 * sweep settling with an older snapshot): the identity the same selection
 * last resolved to keeps the chat painted instead of blanking it
 * (`resolveOpenConversation`).
 *
 * `AIBoard` only ever reads `feedItems[activeSessionKey]`, so the single-entry
 * map is the whole contract.
 */
export function useMcOpenConversation(
  items: KanbanItem[],
  selectedId: string | null,
) {
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const justCreated = useJustCreatedMission(items);
  const created = justCreated.fallbackFor(selectedId);

  // Render-time write, idempotent per (selectedId, items): only a REAL card
  // refreshes the remembered identity, so it never carries a fallback forward.
  const lastResolvedRef = useRef<OpenConversationIdentity | null>(null);
  const identity = resolveOpenConversation({
    selectedId,
    selectedItem,
    created,
    lastResolved: lastResolvedRef.current,
  });
  if (identity && selectedItem) lastResolvedRef.current = identity;

  const activeSessionKey = identity?.sessionKey ?? null;
  const activeAgentPath = identity?.agentPath ?? null;

  const activeVm = useConversationVm(activeAgentPath, activeSessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () =>
      activeSessionKey ? { [activeSessionKey]: activeVm?.feed ?? [] } : {},
    [activeSessionKey, activeVm],
  );
  // Scroll-up lazy-load (HOU-819): the open chat renders the transcript's tail
  // window; older pages prepend on scroll.
  const hasOlderMessages = (activeVm?.historyWindow?.earliestLoaded ?? 0) > 0;
  const onLoadOlderMessages = useCallback(async () => {
    if (!activeAgentPath || !activeSessionKey) return;
    await tauriChat.loadOlderHistory(activeAgentPath, activeSessionKey);
  }, [activeAgentPath, activeSessionKey]);

  return {
    selectedItem,
    activeSessionKey,
    activeAgentPath,
    activeVm,
    feedItems,
    hasOlderMessages,
    onLoadOlderMessages,
    /** Hold a just-created mission's identity until its row lands. */
    rememberCreated: justCreated.remember,
  };
}

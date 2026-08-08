import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useConversationVm } from "../../hooks/use-conversation-vm";
import { tauriChat } from "../../lib/tauri";
import { useJustCreatedMission } from "./use-just-created-mission";

/**
 * WHICH conversation the cross-agent board has open, and its live feed.
 *
 * Two facts name it — the session key and the agent path — and on a
 * cross-agent board neither is implicit: the selected CARD carries both in its
 * metadata. The one case where the card does not exist yet is a mission created
 * on this board, whose row the sweep has not returned; `useJustCreatedMission`
 * holds its identity for exactly that beat, so the panel that just opened never
 * loses the user's first message.
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

  const activeSessionKey = selectedItem
    ? ((selectedItem.metadata?.sessionKey as string | undefined) ??
      `activity-${selectedItem.id}`)
    : (created?.sessionKey ?? null);
  const activeAgentPath =
    (selectedItem?.metadata?.agentPath as string | undefined) ??
    created?.agentPath ??
    null;

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

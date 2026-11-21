import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useConversationVm } from "../../hooks/use-conversation-vm";
import { paintedSessionKey } from "../../lib/perf-span-marks";
import { perfSpans } from "../../lib/perf-spans";
import { tauriChat } from "../../lib/tauri";
import {
  type OpenConversationIdentity,
  resolveOpenConversation,
} from "./open-conversation-identity";
import { useJustCreatedMission } from "./use-just-created-mission";

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
  const painted = paintedSessionKey(
    activeSessionKey,
    activeVm?.feed.length ?? 0,
  );
  useEffect(() => {
    if (painted === null) return;
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => perfSpans.chatRendered());
    else perfSpans.chatRendered();
  }, [painted]);
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
    rememberCreated: justCreated.remember,
  };
}

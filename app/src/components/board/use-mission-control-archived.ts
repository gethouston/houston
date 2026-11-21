import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { useQueryClient } from "@tanstack/react-query";
import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { useAllConversations } from "../../hooks/queries";
import { useMissionOriginTag } from "../../hooks/use-mission-origin-tag";
import { useOpenConversationFeed } from "../../hooks/use-open-conversation-feed";
import { missionCardTags } from "../../lib/mission-card";
import { type HistoryLoadOptions, tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { archivedMissionRows } from "./archived-mission-filter";
import { boardItemConversationRow } from "./board-item-row";
import { agentsByPath, missionCardAgentName } from "./mission-card-agent";
import { deleteMission } from "./mission-writes";
import { rowSessionKey } from "./session-loading";

export function useMissionControlArchived(agents: Agent[]) {
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: convos } = useAllConversations(agentPaths);
  const queryClient = useQueryClient();

  const agentsByFolderPath = useMemo(() => agentsByPath(agents), [agents]);
  const originTagOf = useMissionOriginTag(agents);
  const agentMap = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.folderPath] = a;
    return m;
  }, [agents]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pathMapRef = useRef<Record<string, string>>({});
  const sessionMapRef = useRef<
    Record<string, { agentPath: string; activityId: string }>
  >({});

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const sessionMap: Record<
      string,
      { agentPath: string; activityId: string }
    > = {};
    const result = archivedMissionRows(convos).map((c) => {
      map[c.id] = c.agent_path;
      sessionMap[c.session_key] = {
        agentPath: c.agent_path,
        activityId: c.id,
      };
      return {
        id: c.id,
        title: c.title,
        description: messagePreviewText(c.description),
        group: missionCardAgentName(
          agentsByFolderPath,
          c.agent_path,
          c.agent_name,
        ),
        icon: createElement(AgentCardAvatar, {
          color: agentsByFolderPath.get(c.agent_path)?.color,
        }),
        status: c.status ?? "archived",
        lastMessageAt:
          c.last_message_at ?? c.updated_at ?? new Date().toISOString(),
        tags: missionCardTags(originTagOf(c)),
        metadata: {
          agentPath: c.agent_path,
          sessionKey: c.session_key,
          ...(c.agent ? { agent: c.agent } : {}),
          ...(c.routine_id ? { routineId: c.routine_id } : {}),
        },
      };
    });
    pathMapRef.current = map;
    sessionMapRef.current = sessionMap;
    return result;
  }, [convos, agentsByFolderPath, originTagOf]);

  const sessionKeyFor = useCallback(
    (activityId: string) => {
      const item = items.find((i) => i.id === activityId);
      return rowSessionKey(
        item ? boardItemConversationRow(item) : { id: activityId },
      );
    },
    [items],
  );

  const activeSessionKey = selectedId ? sessionKeyFor(selectedId) : null;
  const activeAgentPath = activeSessionKey
    ? (sessionMapRef.current[activeSessionKey]?.agentPath ?? null)
    : null;
  const { feedItems, hasOlderMessages, onLoadOlderMessages } =
    useOpenConversationFeed(activeAgentPath, activeSessionKey);

  const loadHistory = useCallback(
    async (
      sessionKey: string,
      opts?: HistoryLoadOptions,
    ): Promise<FeedItem[]> => {
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      if (!agentPath) return [];
      return (await tauriChat.loadHistory(
        agentPath,
        sessionKey,
        opts,
      )) as FeedItem[];
    },
    [],
  );

  const handleDelete = useCallback(
    (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      void deleteMission(queryClient, agentPath, item, "archive");
      if (selectedId === item.id) setSelectedId(null);
    },
    [queryClient, selectedId],
  );

  const selectedItem = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null;
  const activeAgent = selectedItem
    ? (agentMap[selectedItem.metadata?.agentPath as string] ?? null)
    : null;

  return {
    items,
    rawConversations: convos,
    feedItems,
    selectedId,
    setSelectedId,
    selectedItem,
    activeAgent,
    selectedSessionKey: activeSessionKey,
    sessionKeyFor,
    loadHistory,
    onLoadOlderMessages,
    hasOlderMessages,
    handleDelete,
    agentMap,
  };
}

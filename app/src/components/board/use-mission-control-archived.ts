import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanItem } from "@houston-ai/board";
import { mergeFeedHistory, messagePreviewText } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../../stores/feeds";
import { useAllConversations } from "../../hooks/queries";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { tauriActivity, tauriAttachments, tauriChat } from "../../lib/tauri";
import { missionCardTags } from "../../lib/mission-card";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import type { Agent } from "../../lib/types";

/**
 * Cross-agent archived data: every agent's *archived* missions on one list,
 * mirroring {@link useMissionControl} (feed flattening + agent maps) but
 * filtered to `status === "archived"`. Send/reactivation lives in the
 * component (it needs the chat panel's effective provider/model), so this hook
 * stays data-only: items, feed, history, delete, and the session→agent maps.
 */
export function useMissionControlArchived(agents: Agent[]) {
  const { t } = useTranslation(["board"]);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const setFeed = useFeedStore((s) => s.setFeed);
  const allItems = useFeedStore((s) => s.items);

  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: convos } = useAllConversations(agentPaths);

  const feedItems = useMemo(() => {
    const out: Record<string, FeedItem[]> = {};
    for (const ap of agentPaths) {
      const bucket = allItems[ap];
      if (!bucket) continue;
      for (const [sk, items] of Object.entries(bucket)) out[sk] = items;
    }
    return out;
  }, [allItems, agentPaths]);

  const agentColorMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);
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
    const result = convos
      .filter((c) => c.type === "activity" && c.status === "archived")
      .map((c) => {
        const agent = agentMap[c.agent_path];
        const agentModes = agent
          ? getAgentDef(agent.configId)?.config.agents
          : undefined;
        map[c.id] = c.agent_path;
        sessionMap[c.session_key] = {
          agentPath: c.agent_path,
          activityId: c.id,
        };
        return {
          id: c.id,
          title: c.title,
          description: messagePreviewText(c.description),
          group: c.agent_name,
          icon: createElement(AgentCardAvatar, {
            color: agentColorMap[c.agent_path],
          }),
          status: c.status ?? "archived",
          updatedAt: c.updated_at ?? new Date().toISOString(),
          tags: missionCardTags({
            agent: c.agent,
            agentModes,
            routineId: c.routine_id,
            routineLabel: t("board:tags.routine"),
          }),
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
  }, [convos, agentColorMap, agentMap, getAgentDef, t]);

  const sessionKeyFor = useCallback(
    (activityId: string) => {
      const item = items.find((i) => i.id === activityId);
      return (
        (item?.metadata?.sessionKey as string | undefined) ??
        `activity-${activityId}`
      );
    },
    [items],
  );

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<FeedItem[]> => {
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      if (!agentPath) return [];
      return (await tauriChat.loadHistory(agentPath, sessionKey)) as FeedItem[];
    },
    [],
  );

  const handleHistoryLoaded = useCallback(
    (sessionKey: string, history: FeedItem[]) => {
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      if (!agentPath) return;
      const current =
        useFeedStore.getState().items[agentPath]?.[sessionKey] ?? [];
      setFeed(agentPath, sessionKey, mergeFeedHistory(history, current));
    },
    [setFeed],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      await tauriAttachments.delete(`activity-${item.id}`).catch(() => {});
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  return {
    items,
    feedItems,
    selectedId,
    setSelectedId,
    sessionKeyFor,
    loadHistory,
    handleHistoryLoaded,
    handleDelete,
    agentMap,
  };
}

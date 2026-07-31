import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useOpenConversationFeed } from "../../hooks/use-open-conversation-feed";
import { isSetupChatMode } from "../../lib/integration-chat-setup";
import { missionCardTags } from "../../lib/mission-card";
import {
  type HistoryLoadOptions,
  tauriActivity,
  tauriChat,
} from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { AgentCardAvatar } from "../shell/agent-card-avatar";

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

  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: convos } = useAllConversations(agentPaths);

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
      .filter(
        (c) =>
          c.type === "activity" &&
          c.status === "archived" &&
          !isSetupChatMode(c.agent),
      )
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
          // Decode a Skill / attachment first-message marker to the user's
          // words; never echo the raw `<!--houston:...-->` on the card (HOU-425).
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

  // The open conversation's reactive feed, plus its scroll-up lazy-load — the
  // same seam the per-agent Archived tab uses.
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
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      // Files attached in this conversation stay in the workspace's uploads/
      // folder — they are agent context, not conversation scratch (HOU-706).
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  // The open mission resolved all the way through to the agent that owns it:
  // the chat panel, the send path and the archived → active handoff all need
  // the same four values, so they are derived ONCE here rather than in the view.
  const selectedItem = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null;
  const activeAgent = selectedItem
    ? (agentMap[selectedItem.metadata?.agentPath as string] ?? null)
    : null;
  const activeAgentDef = activeAgent
    ? (getAgentDef(activeAgent.configId) ?? null)
    : null;

  return {
    items,
    feedItems,
    selectedId,
    setSelectedId,
    selectedItem,
    activeAgent,
    activeAgentDef,
    selectedSessionKey: activeSessionKey,
    sessionKeyFor,
    loadHistory,
    onLoadOlderMessages,
    hasOlderMessages,
    handleDelete,
    agentMap,
  };
}

import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanItem } from "@houston-ai/board";
import { mergeFeedHistory, type FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import {
  getSessionStatusKey,
  isActiveSessionStatus,
  useSessionStatusStore,
} from "../stores/session-status";
import { useQueryClient } from "@tanstack/react-query";
import { useAllConversations } from "../hooks/queries";
import {
  tauriActivity,
  tauriChat,
  tauriAttachments,
  tauriConfig,
  tauriWorktree,
  tauriShell,
} from "../lib/tauri";
import { buildAttachmentPrompt } from "../lib/attachment-message";
import { createMission } from "../lib/create-mission";
import { resolveActivityOverride } from "./mission-control-send";
import { formatVisibleMessageText } from "../lib/queued-chat";
import { queryKeys } from "../lib/query-keys";
import { useUIStore } from "../stores/ui";
import type { Agent } from "../lib/types";
import { createElement } from "react";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

export function useMissionControl(agents: Agent[]) {
  const { t } = useTranslation("chat");
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  // Mission control is cross-agent. Flatten the nested feed store into a
  // single sessionKey → items map, filtered to the agents on this view.
  const allItems = useFeedStore((s) => s.items);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const feedItems = useMemo(() => {
    const out: Record<string, FeedItem[]> = {};
    for (const ap of agentPaths) {
      const bucket = allItems[ap];
      if (!bucket) continue;
      for (const [sk, items] of Object.entries(bucket)) {
        out[sk] = items;
      }
    }
    return out;
  }, [allItems, agentPaths]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const pathMapRef = useRef<Record<string, string>>({});

  const paths = useMemo(
    () => agents.map((a) => a.folderPath),
    [agents],
  );

  const { data: convos, isFetched } = useAllConversations(paths);

  const agentColorMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const result = convos
      .filter((c) => c.type === "activity" && c.status)
      .map((c) => {
        map[c.id] = c.agent_path;
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          group: c.agent_name,
          icon: createElement(AgentCardAvatar, { color: agentColorMap[c.agent_path] }),
          status: c.status!,
          updatedAt: c.updated_at ?? new Date().toISOString(),
          metadata: { agentPath: c.agent_path, sessionKey: c.session_key },
        };
      });
    pathMapRef.current = map;
    return result;
  }, [convos, agentColorMap]);

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<FeedItem[]> => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return [];
      const history = await tauriChat.loadHistory(agentPath, sessionKey);
      return history as FeedItem[];
    },
    [],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      // Drop any cached attachments for this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${item.id}`).catch(() => {});
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { status: "done" });
    },
    [],
  );

  const handleRename = useCallback(
    async (item: KanbanItem, newTitle: string) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { title: newTitle });
    },
    [],
  );

  const setFeed = useFeedStore((s) => s.setFeed);
  const handleHistoryLoaded = useCallback(
    (sessionKey: string, history: FeedItem[]) => {
      // Mirror board-tab's hydration: when AIBoard loads persisted chat
      // for an activity, drop the server slice into the feed store so
      // the ChatPanel renders it. Without this Mission Control would
      // open a conversation and show an empty chat (history was loaded
      // but had nowhere to land).
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return;
      const current = useFeedStore.getState().items[agentPath]?.[sessionKey] ?? [];
      setFeed(agentPath, sessionKey, mergeFeedHistory(history, current));
    },
    [setFeed],
  );

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return;
      try {
        const paths = await tauriAttachments.save(`activity-${activityId}`, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        // Mission Control is cross-agent: the activity's stored provider/model
        // is the per-activity override that the chat picker is showing. The
        // engine session router only reads agent config when no override is
        // sent, so dropping the activity's choice here routes the message to
        // whatever CLI the agent defaults to (e.g. agent=openai but activity
        // was created with Opus -> spawns codex instead of claude). Look the
        // activity up and forward its override pair to keep picker and wire
        // in agreement.
        const list = await tauriActivity.list(agentPath);
        const overrides = resolveActivityOverride(sessionKey, list);
        await tauriChat.send(agentPath, prompt, sessionKey, overrides);
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: prompt });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [pushFeedItem, t],
  );

  // Blank "New mission" create path for Mission Control. Mirrors the
  // per-agent BoardTab `handleCreateConversation` (it routes through the
  // same `createMission` source of truth) but takes the agent explicitly
  // because this view is cross-agent. Wired into AIBoard via
  // `onCreateConversation`; without it a blank submit had no handler and
  // the composer silently cleared (issue #328). AIBoard selects the
  // returned activity id, so we don't call setSelectedId here.
  const handleCreateConversation = useCallback(
    async (
      agent: Agent,
      text: string,
      files: File[],
      opts?: {
        agentMode?: string;
        promptFile?: string;
        providerOverride?: string;
        modelOverride?: string;
      },
    ): Promise<string> => {
      const agentPath = agent.folderPath;

      // Honour worktree mode when the agent's config opts in — same
      // bootstrap as the BoardTab create path.
      let worktreePath: string | undefined;
      try {
        const cfg = await tauriConfig.read(agentPath);
        if (cfg.worktreeMode) {
          const slug = crypto.randomUUID().slice(0, 8);
          const wt = await tauriWorktree.create(agentPath, slug);
          worktreePath = wt.path;
          const installCmd = cfg.installCommand as string | undefined;
          if (installCmd && worktreePath) {
            tauriShell.run(worktreePath, installCmd).catch(console.error);
          }
        }
      } catch {
        /* config may not exist yet */
      }

      const visible = formatVisibleMessageText(
        text,
        files,
        (names) => t("queue.attached", { names }),
      );
      let userMessage = text;
      try {
        const { conversationId, sessionKey } = await createMission(
          { id: agent.id, name: agent.name, color: agent.color, folderPath: agentPath },
          text,
          {
            agentMode: opts?.agentMode,
            worktreePath,
            promptFile: opts?.promptFile,
            providerOverride: opts?.providerOverride,
            modelOverride: opts?.modelOverride,
            titleText: visible,
            buildPrompt: async (activityId) => {
              const saved = await tauriAttachments.save(`activity-${activityId}`, files);
              userMessage = buildAttachmentPrompt(text, files, saved);
              return userMessage;
            },
          },
        );
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: userMessage });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        // createMission bypasses the activity mutation hooks, so refresh
        // the cross-agent conversation list manually.
        queryClient.invalidateQueries({ queryKey: queryKeys.allConversations(paths) });
        return conversationId;
      } catch (err) {
        // No silent failures: createMission already rolled back the
        // half-created activity. Surface why the mission did not start so
        // the user can retry or report it.
        addToast({
          title: t("errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [t, pushFeedItem, queryClient, paths, addToast],
  );

  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    const itemStatusBySession = new Map<string, string>();
    for (const item of items) {
      const sessionKey = (item.metadata?.sessionKey as string | undefined) ?? `activity-${item.id}`;
      itemStatusBySession.set(sessionKey, item.status);
    }
    for (const [sessionKey, value] of Object.entries(loading)) {
      if (!value) continue;
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      const status = agentPath
        ? sessionStatuses[getSessionStatusKey(agentPath, sessionKey)]
        : undefined;
      const activityStatus = itemStatusBySession.get(sessionKey);
      if (!status && activityStatus && activityStatus !== "running") {
        continue;
      }
      if (!status || isActiveSessionStatus(status)) {
        out[sessionKey] = true;
      }
    }
    for (const item of items) {
      const sessionKey = (item.metadata?.sessionKey as string | undefined) ?? `activity-${item.id}`;
      const agentPath = pathMapRef.current[item.id];
      const status = agentPath
        ? sessionStatuses[getSessionStatusKey(agentPath, sessionKey)]
        : undefined;
      if (item.status === "running" || isActiveSessionStatus(status)) {
        out[sessionKey] = true;
      }
    }
    return out;
  }, [items, loading, sessionStatuses]);

  return {
    items,
    selectedId,
    setSelectedId,
    loading: effectiveLoading,
    isLoaded: isFetched,
    feedItems,
    loadHistory,
    handleHistoryLoaded,
    handleDelete,
    handleApprove,
    handleRename,
    handleSendMessage,
    handleCreateConversation,
  };
}

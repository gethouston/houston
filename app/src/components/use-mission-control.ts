import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { useQueryClient } from "@tanstack/react-query";
import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../hooks/queries";
import { useUserProfiles } from "../hooks/queries/use-user-profiles";
import { useCapabilities } from "../hooks/use-capabilities";
import {
  getConversationStatus,
  useConversationVm,
} from "../hooks/use-conversation-vm";
import { buildAttachmentPrompt } from "../lib/attachment-message";
import { createMission } from "../lib/create-mission";
import { missionCardTags } from "../lib/mission-card";
import {
  buildMissionPeople,
  collectContributorIds,
} from "../lib/mission-people";
import { isMultiplayer } from "../lib/org-roles";
import { queryKeys } from "../lib/query-keys";
import { formatVisibleMessageText } from "../lib/queued-chat";
import { isRoutineSetupMode } from "../lib/routine-chat-setup";
import {
  type HistoryLoadOptions,
  tauriActivity,
  tauriAttachments,
  tauriChat,
  tauriConfig,
} from "../lib/tauri";
import { readAgentTurnMode } from "../lib/turn-mode";
import type { Agent } from "../lib/types";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useUIStore } from "../stores/ui";
import { resolveActivityOverride } from "./mission-control-send";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

export function useMissionControl(agents: Agent[]) {
  const { t } = useTranslation(["chat", "board"]);
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  // activityId → agentPath. Keyed by the activity id (the KanbanItem id), used
  // by the card-level handlers (delete/approve/rename) that operate on item.id.
  const pathMapRef = useRef<Record<string, string>>({});
  // session_key → { agentPath, activityId }. A routine chat's key is
  // `routine-{rid}`, NOT `activity-{id}`, so stripping an "activity-" prefix to
  // recover the agent fails for routines and the chat loads empty. Resolve by
  // the stored session_key directly instead (#381).
  const sessionMapRef = useRef<
    Record<string, { agentPath: string; activityId: string }>
  >({});

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);

  const { data: convos, isFetched } = useAllConversations(paths);

  // Per-mission attribution (hosted Teams only): resolve the contributor ids on
  // every visible conversation to display profiles. Single-player never runs
  // the query (useUserProfiles is multiplayer-gated) and gets no `people` key,
  // so the board stays byte-identical to desktop.
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const contributorIds = useMemo(
    () => (multiplayer && convos ? collectContributorIds(convos) : []),
    [multiplayer, convos],
  );
  const { profiles } = useUserProfiles(contributorIds);

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

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const sessionMap: Record<
      string,
      { agentPath: string; activityId: string }
    > = {};
    const result = convos
      // Archived missions live in the per-agent Archived tab — keep them off
      // the cross-agent active board. Routine-setup chats live in the
      // Routines tab, never as a card.
      .filter(
        (c) =>
          c.type === "activity" &&
          c.status &&
          c.status !== "archived" &&
          !isRoutineSetupMode(c.agent),
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
        const people = multiplayer ? buildMissionPeople(c, profiles) : [];
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
          status: c.status ?? "",
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
          ...(people.length > 0 ? { people } : {}),
        };
      });
    pathMapRef.current = map;
    sessionMapRef.current = sessionMap;
    return result;
  }, [convos, agentColorMap, agentMap, getAgentDef, multiplayer, profiles, t]);

  // The open conversation's reactive feed, straight from the SDK conversation
  // VM. AIBoard only ever reads `feedItems[activeSessionKey]`, so a
  // single-entry map for the selected session is the whole contract.
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const activeSessionKey = selectedItem
    ? ((selectedItem.metadata?.sessionKey as string | undefined) ??
      `activity-${selectedItem.id}`)
    : null;
  const activeAgentPath =
    (selectedItem?.metadata?.agentPath as string | undefined) ?? null;
  const activeVm = useConversationVm(activeAgentPath, activeSessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () =>
      activeSessionKey ? { [activeSessionKey]: activeVm?.feed ?? [] } : {},
    [activeSessionKey, activeVm],
  );

  const loadHistory = useCallback(
    async (
      sessionKey: string,
      opts?: HistoryLoadOptions,
    ): Promise<FeedItem[]> => {
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      if (!agentPath) return [];
      const history = await tauriChat.loadHistory(agentPath, sessionKey, opts);
      return history as FeedItem[];
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

  const handleApprove = useCallback(async (item: KanbanItem) => {
    const agentPath = pathMapRef.current[item.id];
    if (!agentPath) return;
    await tauriActivity.update(agentPath, item.id, { status: "done" });
  }, []);

  const handleRename = useCallback(
    async (item: KanbanItem, newTitle: string) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { title: newTitle });
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const entry = sessionMapRef.current[sessionKey];
      if (!entry) return;
      const { agentPath, activityId } = entry;
      try {
        const paths = await tauriAttachments.save(
          `activity-${activityId}`,
          files,
        );
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
        // Mode is per-agent composer memory (config.mode), not per-activity:
        // Mission Control has no live pill state, so read it at send time.
        overrides.modeOverride = await readAgentTurnMode(
          agentPath,
          tauriConfig.read,
        );
        // The turn stream pushes the user bubble into the conversation VM
        // itself — no app-side optimistic push. If the conversation is
        // mid-turn the adapter holds this send; the queued bubble shows the
        // user's words, not the built prompt.
        await tauriChat.send(agentPath, prompt, sessionKey, {
          ...overrides,
          queuedPreview: {
            text,
            attachmentNames: files.map((f) => f.name),
          },
        });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        // The send failed BEFORE a turn stream existed (attachment save,
        // activity lookup, refused start) — nothing wrote to the VM, so
        // surface it as a toast, same as the create path below.
        addToast({
          title: t("errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [addToast, t],
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

      try {
        const visible = formatVisibleMessageText(text, files, (names) =>
          t("queue.attached", { names }),
        );
        const { conversationId, sessionKey } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: agentPath,
          },
          text,
          {
            agentMode: opts?.agentMode,
            promptFile: opts?.promptFile,
            providerOverride: opts?.providerOverride,
            modelOverride: opts?.modelOverride,
            // Per-agent composer memory; Mission Control has no pill state.
            modeOverride: await readAgentTurnMode(agentPath, tauriConfig.read),
            titleText: visible,
            buildPrompt: async (activityId) => {
              const saved = await tauriAttachments.save(
                `activity-${activityId}`,
                files,
              );
              return buildAttachmentPrompt(text, files, saved);
            },
          },
        );
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
        // createMission bypasses the activity mutation hooks, so refresh
        // the cross-agent conversation list manually.
        queryClient.invalidateQueries({
          queryKey: queryKeys.allConversations(paths),
        });
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
    [t, queryClient, paths, addToast],
  );

  // Per-session run state. The conversation VM is the live source: the open
  // session's `activeFeed` subscription keeps this recomputing while its turn
  // runs; background sessions re-derive when the activity list refetches (the
  // SessionStatus/ActivityChanged invalidations), reading VM status
  // synchronously. "idle"/unpublished falls back to the card's activity
  // status, which the turn stream persists host-side at start and settle.
  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    const itemStatusBySession = new Map<string, string>();
    for (const item of items) {
      const sessionKey =
        (item.metadata?.sessionKey as string | undefined) ??
        `activity-${item.id}`;
      itemStatusBySession.set(sessionKey, item.status);
    }
    const vmStatusFor = (agentPath: string | undefined, sessionKey: string) => {
      // The open session reads its SUBSCRIBED vm (the reactive path — its
      // spinner updates as the turn streams and settles); background sessions
      // are read synchronously and re-derive on the activity refetch.
      const s =
        sessionKey === activeSessionKey && agentPath === (activeAgentPath ?? "")
          ? activeVm?.sessionStatus
          : agentPath
            ? getConversationStatus(agentPath, sessionKey)
            : undefined;
      return s === "idle" ? undefined : s;
    };
    for (const [sessionKey, value] of Object.entries(loading)) {
      if (!value) continue;
      const agentPath = sessionMapRef.current[sessionKey]?.agentPath;
      const status = vmStatusFor(agentPath, sessionKey);
      const activityStatus = itemStatusBySession.get(sessionKey);
      if (!status && activityStatus && activityStatus !== "running") {
        continue;
      }
      if (!status || status === "running") {
        out[sessionKey] = true;
      }
    }
    for (const item of items) {
      const sessionKey =
        (item.metadata?.sessionKey as string | undefined) ??
        `activity-${item.id}`;
      const agentPath = pathMapRef.current[item.id];
      if (
        item.status === "running" ||
        vmStatusFor(agentPath, sessionKey) === "running"
      ) {
        out[sessionKey] = true;
      }
    }
    return out;
  }, [items, loading, activeVm, activeSessionKey, activeAgentPath]);

  return {
    items,
    selectedId,
    setSelectedId,
    loading: effectiveLoading,
    isLoaded: isFetched,
    feedItems,
    loadHistory,
    handleDelete,
    handleApprove,
    handleRename,
    handleSendMessage,
    handleCreateConversation,
  };
}

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AIBoard } from "@houston-ai/board";
import type { KanbanItem, NewPanelOpener } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { Terminal, GitBranch } from "lucide-react";

import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useDraftStore } from "../../stores/drafts";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import {
  getSessionStatusKey,
  isActiveSessionStatus,
  useSessionStatusStore,
} from "../../stores/session-status";
import {
  useActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "../../hooks/queries";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { tauriActivity, tauriChat, tauriAttachments, tauriWorktree, tauriShell, tauriTerminal, tauriConfig, tauriPreferences } from "../../lib/tauri";
import { openAgentHref } from "../../lib/open-href";
import { createMission } from "../../lib/create-mission";
import { formatVisibleMessageText } from "../../lib/queued-chat";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { queryKeys } from "../../lib/query-keys";
import { analytics } from "../../lib/analytics";
import type { TabProps } from "../../lib/types";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { HoustonThinkingIndicator } from "../shell/experience-card";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import { MissionBoardEmptyState } from "../mission-board-empty-state";
import { useMissionSearch } from "../use-mission-search";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { buildMissionBoardColumns } from "../mission-board-columns";
import { navigateBoard } from "../../lib/board-navigate";

// Stable empty reference so the feed store selector doesn't return a new
// object every render when this agent has no feeds yet (which would otherwise
// trigger "getSnapshot should be cached" / infinite loop in React).
const EMPTY_FEED_BUCKET: Record<string, never> = Object.freeze({});

export default function BoardTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation(["board", "dashboard", "chat"]);
  const queuedLabels = useQueuedMessageLabels();
  const cardLabels = {
    approve: t("board:cardActions.approve"),
    approveTooltip: t("board:cardActions.approveTooltip"),
    renameTooltip: t("board:cardActions.renameTooltip"),
    deleteTooltip: t("board:cardActions.deleteTooltip"),
    deleteTitle: (name: string) => t("board:deleteCard.titleWithName", { name }),
    deleteDescription: t("board:deleteCard.description"),
  };
  // Mirror Mission Control's columns so the tab and dashboard stay in
  // sync. Without an explicit `columns` prop AIBoard falls back to its
  // hardcoded English defaults.
  const panelContainer = useDetailPanelContainer();
  const path = agent.folderPath;
  const agentModes = agentDef.config.agents;
  const [pendingAgentMode, setPendingAgentMode] = useState<string | null>(null);
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const updateActivity = useUpdateActivity(path);
  const queryClient = useQueryClient();
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const setOnBoardNavigate = useUIStore((s) => s.setOnBoardNavigate);
  const setOnBoardOpen = useUIStore((s) => s.setOnBoardOpen);
  const setOnPanelClose = useUIStore((s) => s.setOnPanelClose);
  const setBoardActions = useUIStore((s) => s.setBoardActions);
  const missionSearchQuery = useUIStore((s) => s.agentMissionSearchQueries[path] ?? "");
  const setAgentMissionSearchQuery = useUIStore((s) => s.setAgentMissionSearchQuery);
  const setAgentMissionSearchLoading = useUIStore((s) => s.setAgentMissionSearchLoading);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const addToast = useUIStore((s) => s.addToast);
  const attachmentValidation = useAttachmentRejectionDialog();
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const handleOpenLink = useCallback(
    (url: string) => {
      openAgentHref(url, path);
    },
    [path],
  );

  const openerRef = useRef<NewPanelOpener | null>(null);
  const closerRef = useRef<(() => void) | null>(null);
  const emptyAutoOpenKeyRef = useRef<string | null>(null);
  const [newPanelOpenerReady, setNewPanelOpenerReady] = useState(false);
  const openDefaultMission = useCallback(() => {
    if (agentModes?.length) setPendingAgentMode(agentModes[0].id);
    openerRef.current?.({ focusComposer: true });
  }, [agentModes]);
  const boardColumns = buildMissionBoardColumns(
    {
      running: t("dashboard:columns.running"),
      needsYou: t("dashboard:columns.needsYou"),
      done: t("dashboard:columns.done"),
      newMission: t("empty.newMission"),
    },
    openDefaultMission,
  );

  const items: KanbanItem[] = useMemo(
    () => (rawItems ?? []).map((t) => {
      const mode = agentModes?.find((m) => m.id === t.agent);
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        updatedAt: t.updated_at ?? new Date().toISOString(),
        group: agent.name,
        tags: mode ? [mode.name] : (t.routine_id ? ["Routine"] : undefined),
        metadata: {
          ...(t.session_key ? { sessionKey: t.session_key } : {}),
          ...(t.routine_id ? { routineId: t.routine_id } : {}),
          ...(t.agent ? { agent: t.agent } : {}),
          ...(t.worktree_path ? { worktreePath: t.worktree_path } : {}),
        },
      };
    }),
    [agent.name, agentModes, rawItems],
  );

  // Read and consume pending selection from Mission Control
  const pendingId = useUIStore((s) => s.activityPanelId);
  const clearPending = useUIStore((s) => s.setActivityPanelId);
  const [selectedId, setSelectedId] = useState<string | null>(pendingId);
  // The keyboard "focus ring" card — moved by arrow keys, opened by
  // Enter. Kept separate from `selectedId` so arrow nav doesn't auto-
  // mount the chat panel.
  const [highlightedId, setHighlightedId] = useState<string | null>(pendingId);
  useEffect(() => {
    if (pendingId) {
      // Only navigate if the user isn't already viewing a conversation
      // and hasn't opened the New Mission panel.
      if (!selectedId && !missionPanelOpen) setSelectedId(pendingId);
      clearPending(null);
    }
  }, [pendingId, clearPending, selectedId, missionPanelOpen]);

  // Per-agent session key for the currently selected card. Drives the
  // panel hook's action routing (mid-conversation send vs new
  // conversation create).
  const selectedSessionKey = useMemo(() => {
    if (!selectedId) return null;
    const item = (rawItems ?? []).find((t) => t.id === selectedId);
    return item?.session_key ?? `activity-${selectedId}`;
  }, [selectedId, rawItems]);

  // All the per-agent panel features (skill cards, selected Skill, model
  // selector, Skills button, tool/link renderers) come from this hook
  // so the cross-agent Mission Control view can reuse them.
  const panel = useAgentChatPanel({
    agent,
    agentDef,
    selectedSessionKey,
    onSelectSession: setSelectedId,
  });
  const { effectiveProvider, effectiveModel } = panel;

  // Scope to this agent only — cross-agent bleeding is structurally blocked
  // because AIBoard can only see this agent's slice of the feed store.
  // Return the bucket directly (may be undefined) and fall back to a stable
  // EMPTY_FEED_BUCKET constant below. Selectors must return stable references
  // or React will loop.
  const feedBucket = useFeedStore((s) => s.items[path]);
  const feedItems = feedBucket ?? EMPTY_FEED_BUCKET;
  // Draft persistence — extract text-only map for AIBoard
  const rawDrafts = useDraftStore((s) => s.drafts);
  const boardDrafts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawDrafts)) {
      if (v.text) out[k] = v.text;
    }
    return out;
  }, [rawDrafts]);
  const handleDraftChange = useCallback(
    (sessionKey: string, text: string) => {
      useDraftStore.getState().setDraftText(sessionKey, text);
    },
    [],
  );
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const handleHistoryLoaded = useCallback(
    (sessionKey: string, items: FeedItem[]) => {
      // Seed the feed store with persisted history when the user opens
      // an activity. After this, the store is the single source of
      // truth — live WS events append cleanly and no "liveFeed wins if
      // non-empty" hack is needed. Any items already in the bucket
      // from WS events that arrived between activity creation and
      // selection are preserved by merging the server history with
      // the current bucket and dropping exact duplicates by position.
      const current = useFeedStore.getState().items[path]?.[sessionKey] ?? [];
      // Server history is authoritative for everything persisted up to
      // load time. Anything currently in `current` that isn't in the
      // server history must be either an optimistic overlay we pushed
      // or an event that landed mid-load. Append those after the
      // server slice.
      const serverIds = new Set(items.map((it) => JSON.stringify(it)));
      const tail = current.filter((it) => !serverIds.has(JSON.stringify(it)));
      setFeed(path, sessionKey, [...items, ...tail]);
    },
    [path, setFeed],
  );
  const [loadingState, setLoading] = useState<Record<string, boolean>>({});
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);
  // A session is "loading" from the user's perspective whenever its activity
  // is running — not just when WE started it from this component. This catches
  // sessions kicked off elsewhere (onboarding, routines, Mission Control, agent
  // writes) so the ChatPanel keeps Stop/Esc live until SessionStatus reaches a
  // terminal state.
  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(loadingState)) {
      if (!value) continue;
      const knownStatus = sessionStatuses[getSessionStatusKey(path, key)];
      if (!knownStatus || isActiveSessionStatus(knownStatus)) {
        out[key] = true;
      }
    }
    for (const a of rawItems ?? []) {
      const key = a.session_key ?? `activity-${a.id}`;
      const status = sessionStatuses[getSessionStatusKey(path, key)];
      if (isActiveSessionStatus(status)) {
        out[key] = true;
      }
      if (a.status === "running") {
        out[key] = true;
      }
    }
    return out;
  }, [loadingState, rawItems, sessionStatuses, path]);

  // Register the "Start a Mission" handler in the UI store for the TabBar
  const handleOpenerReady = useCallback(
    (opener: NewPanelOpener) => {
      openerRef.current = opener;
      setNewPanelOpenerReady(true);
      // Default "New mission" button — always registered
      setOnStartMission(openDefaultMission);
      // Extra board actions for additional agent modes (skip the first — that's the default button)
      if (agentModes && agentModes.length > 1) {
        setBoardActions(
          agentModes.slice(1).map((mode) => ({
            id: mode.id,
            label: mode.createLabel,
            onClick: () => {
              setPendingAgentMode(mode.id);
              opener({ focusComposer: true });
            },
          })),
        );
      }
    },
    [setOnStartMission, setBoardActions, agentModes, openDefaultMission],
  );

  const handleCloserReady = useCallback((close: () => void) => {
    closerRef.current = close;
  }, []);

  const loadHistory = useCallback(
    async (sessionKey: string) => {
      const history = await tauriChat.loadHistory(path, sessionKey);
      return history as FeedItem[];
    },
    [path],
  );
  const handleMissionSearchError = useCallback(() => {
    addToast({
      title: t("search.historyErrorTitle"),
      description: t("search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  // Arrow-key kanban navigator refs. Declared before `missionSearch`
  // so the assignment below uses the latest visible items.
  const navItemsRef = useRef<KanbanItem[]>(items);
  const navColumnsRef = useRef(boardColumns);
  const selectedIdRef = useRef(selectedId);
  const highlightedIdRef = useRef(highlightedId);
  selectedIdRef.current = selectedId;
  highlightedIdRef.current = highlightedId;
  navColumnsRef.current = boardColumns;

  const missionSearch = useMissionSearch({
    items,
    query: missionSearchQuery,
    loadHistory,
    onHistoryLoadError: handleMissionSearchError,
  });
  // Keep arrow-nav items aligned with what's actually rendered on the
  // board (filtered + searched), not the raw set.
  navItemsRef.current = missionSearch.items;

  useEffect(() => {
    setAgentMissionSearchLoading(path, missionSearch.isSearchingText);
    return () => setAgentMissionSearchLoading(path, false);
  }, [missionSearch.isSearchingText, path, setAgentMissionSearchLoading]);

  useEffect(() => {
    if (!rawItems) return;
    if (missionSearch.hasQuery) return;
    if (rawItems.length > 0) {
      if (emptyAutoOpenKeyRef.current === path) emptyAutoOpenKeyRef.current = null;
      return;
    }
    if (!newPanelOpenerReady || missionPanelOpen || selectedId) return;
    if (emptyAutoOpenKeyRef.current === path) return;
    emptyAutoOpenKeyRef.current = path;
    if (agentModes?.length) setPendingAgentMode(agentModes[0].id);
    openerRef.current?.();
  }, [
    agentModes,
    missionPanelOpen,
    missionSearch.hasQuery,
    newPanelOpenerReady,
    path,
    rawItems,
    selectedId,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setOnStartMission(null);
      setBoardActions([]);
    };
  }, [setOnStartMission, setBoardActions]);

  // Register the arrow-key navigator scoped to THIS agent's board.
  // Refs declared above keep the callback stable while always reading
  // the latest items, highlight, and column config. Arrow navigation
  // walks the HIGHLIGHT (no chat panel open); Enter promotes it to
  // the selection.
  useEffect(() => {
    setOnBoardNavigate((dir) => {
      const next = navigateBoard(
        {
          items: navItemsRef.current,
          columns: navColumnsRef.current,
          selectedId: highlightedIdRef.current,
        },
        dir,
      );
      if (next) setHighlightedId(next);
    });
    setOnBoardOpen(() => {
      const id = highlightedIdRef.current;
      if (id) setSelectedId(id);
    });
    return () => {
      setOnBoardNavigate(null);
      setOnBoardOpen(null);
    };
  }, [setOnBoardNavigate, setOnBoardOpen]);

  // Wire the global Escape handler to close THIS board's chat panel
  // whenever the panel is open — covers both selected-card and the
  // empty new-mission panel. For the new-mission case `selectedId` is
  // null and the panel state lives inside AIBoard, so we delegate to
  // the closer AIBoard hands back via `onPanelCloserReady`.
  useEffect(() => {
    if (!missionPanelOpen) {
      setOnPanelClose(null);
      return;
    }
    setOnPanelClose(() => {
      closerRef.current?.();
      setSelectedId(null);
    });
    return () => setOnPanelClose(null);
  }, [missionPanelOpen, setOnPanelClose]);

  // Reset the pending agent mode (set by the New Mission button) when
  // the panel closes without a card being selected — otherwise the next
  // new-mission panel inherits the previous mode.
  useEffect(() => {
    if (!missionPanelOpen && !selectedId) {
      setPendingAgentMode(null);
    }
  }, [missionPanelOpen, selectedId]);

  // Keep the highlight aligned with the currently-open card so that
  // closing the panel leaves the ring where the user last was.
  useEffect(() => {
    if (selectedId && selectedId !== highlightedIdRef.current) {
      setHighlightedId(selectedId);
    }
  }, [selectedId]);

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await deleteActivity.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId(null);
    },
    [deleteActivity, selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      await updateActivity.mutateAsync({ activityId: item.id, update: { status: "done" } });
    },
    [updateActivity],
  );

  const handleCreateConversation = useCallback(
    async (text: string, files: File[]) => {
      const agentMode = pendingAgentMode ?? agentModes?.[0]?.id;
      const mode = agentModes?.find((m) => m.id === agentMode);

      // Check if worktree mode is enabled
      let worktreePath: string | undefined;
      try {
        const cfg = await tauriConfig.read(path);
        if (cfg.worktreeMode) {
          const slug = crypto.randomUUID().slice(0, 8);
          const wt = await tauriWorktree.create(path, slug);
          worktreePath = wt.path;
          // Run install command in the new worktree
          const installCmd = cfg.installCommand as string | undefined;
          if (installCmd && worktreePath) {
            tauriShell.run(worktreePath, installCmd).catch(console.error);
          }
        }
      } catch { /* config may not exist yet */ }

      // Single source of truth for activity creation + session start. The
      // buildPrompt callback fires after the activity row exists so we can
      // scope attachments to `activity-{id}` and decorate the prompt with
      // their absolute paths in one pass.
      const visible = formatVisibleMessageText(
        text,
        files,
        (names) => t("chat:queue.attached", { names }),
      );
      let userMessage = text;
      const { conversationId, sessionKey } = await createMission(
        { id: agent.id, name: agent.name, color: agent.color, folderPath: path },
        text,
        {
          agentMode,
          worktreePath,
          promptFile: mode?.promptFile,
          // Mirror displayed dropdown (effectiveProvider) so the engine
          // doesn't fall back to its own resolution chain and silently
          // route to a different provider than the UI shows.
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
          titleText: visible,
          buildPrompt: async (activityId) => {
            const saved = await tauriAttachments.save(`activity-${activityId}`, files);
            userMessage = buildAttachmentPrompt(text, files, saved);
            return userMessage;
          },
        },
      );
      pushFeedItem(path, sessionKey, { feed_type: "user_message", data: userMessage });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      setPendingAgentMode(null);
      // createMission bypassed useCreateActivity so invalidate manually.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("mission_created", { agent_mode: agentMode ?? "default" });
      return conversationId;
    },
    [path, agent.id, agent.name, agent.color, pushFeedItem, pendingAgentMode, agentModes, effectiveProvider, effectiveModel, queryClient, t],
  );

  // Derive the session key for an activity, using custom key if set by routine runner
  const sessionKeyFor = useCallback(
    (activityId: string) => {
      const item = (rawItems ?? []).find((t) => t.id === activityId);
      return item?.session_key ?? `activity-${activityId}`;
    },
    [rawItems],
  );

  const handleStopSession = useCallback(
    (sessionKey: string) => {
      tauriChat.stop(path, sessionKey).catch(console.error);
    },
    [path],
  );

  const sendMessageNow = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const activity = (rawItems ?? []).find(
        (t) => (t.session_key ?? `activity-${t.id}`) === sessionKey,
      );
      // Activity status flip (→ "running") is owned by the engine now —
      // `sessions::start` writes it atomically and emits ActivityChanged
      // so every client (desktop, mobile, third-party) sees the same
      // transition. Don't pre-write from the UI.
      const scopeId = activity ? `activity-${activity.id}` : sessionKey;
      try {
        const paths = await tauriAttachments.save(scopeId, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        const mode = agentModes?.find((m) => m.id === activity?.agent);
        await tauriChat.send(path, prompt, sessionKey, {
          mode: mode?.promptFile,
          workingDirOverride: activity?.worktree_path ?? undefined,
          // Effective values mirror the dropdown; see send sites above.
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        pushFeedItem(path, sessionKey, { feed_type: "user_message", data: prompt });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        pushFeedItem(path, sessionKey, {
          feed_type: "system_message",
          data: t("chat:errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [path, pushFeedItem, rawItems, agentModes, effectiveProvider, effectiveModel, t],
  );

  const selectedSessionActive = selectedSessionKey
    ? (effectiveLoading[selectedSessionKey] ?? false)
    : false;
  const sendSelectedNow = useCallback(
    async (text: string, files: File[]) => {
      if (!selectedSessionKey) return;
      await sendMessageNow(selectedSessionKey, text, files);
    },
    [selectedSessionKey, sendMessageNow],
  );
  const messageQueue = useSessionMessageQueue({
    agentPath: path,
    sessionKey: selectedSessionKey,
    isActive: selectedSessionActive,
    sendNow: sendSelectedNow,
  });
  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      if (sessionKey === selectedSessionKey) {
        await messageQueue.sendOrQueue(text, files);
        return;
      }
      await sendMessageNow(sessionKey, text, files);
    },
    [selectedSessionKey, messageQueue.sendOrQueue, sendMessageNow],
  );
  const handleComposerSubmit = useCallback<NonNullable<typeof panel.onComposerSubmit>>(
    async (ctx) => {
      if (ctx.sessionKey && ctx.sessionKey === selectedSessionKey && selectedSessionActive) {
        messageQueue.queueMessage(ctx.text, ctx.files);
        return true;
      }
      return (await panel.onComposerSubmit?.(ctx)) ?? false;
    },
    [selectedSessionKey, selectedSessionActive, messageQueue.queueMessage, panel.onComposerSubmit],
  );
  const queuedMessages = useMemo(
    () => selectedSessionKey ? { [selectedSessionKey]: messageQueue.queuedMessages } : {},
    [selectedSessionKey, messageQueue.queuedMessages],
  );

  const handleRunInTerminal = useCallback(
    async (item: KanbanItem) => {
      const wtPath = item.metadata?.worktreePath as string | undefined;
      if (!wtPath) return;
      let devCmd: string | undefined;
      try {
        const cfg = await tauriConfig.read(path);
        devCmd = cfg.devCommand as string | undefined;
      } catch { /* ignore */ }
      const terminal = await tauriPreferences.get("terminal") ?? undefined;
      tauriTerminal.open(wtPath, devCmd, terminal).catch(console.error);
    },
    [path],
  );

  const cardActions = useCallback(
    (item: KanbanItem) => {
      const wtPath = item.metadata?.worktreePath as string | undefined;
      if (!wtPath) return undefined;
      return (
        <button
          onClick={(e) => { e.stopPropagation(); handleRunInTerminal(item); }}
          className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-secondary text-foreground text-[10px] font-medium hover:bg-accent transition-colors duration-200"
          title={t("cardActions.openTerminal")}
        >
          <Terminal className="size-2.5" />
          {t("cardActions.run")}
        </button>
      );
    },
    [handleRunInTerminal, t],
  );

  const panelActions = useCallback(
    (item: KanbanItem) => {
      const wtPath = item.metadata?.worktreePath as string | undefined;
      if (!wtPath) return undefined;
      const label = wtPath.split("/").pop() ?? wtPath;
      return (
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1 h-5 px-1.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-medium truncate max-w-[160px]"
            title={wtPath}
          >
            <GitBranch className="size-2.5 shrink-0" />
            {label}
          </span>
          <button
            onClick={() => handleRunInTerminal(item)}
            className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-secondary text-foreground text-[10px] font-medium hover:bg-accent transition-colors duration-200"
            title={t("cardActions.openTerminal")}
          >
            <Terminal className="size-2.5" />
            {t("cardActions.run")}
          </button>
        </div>
      );
    },
    [handleRunInTerminal, t],
  );

  // Only render an empty state when the user is actively searching and
  // got no matches — that's contextual feedback they asked for. We
  // intentionally do NOT show an empty state for "no missions at all",
  // because the board flashes through that state on every app open
  // before `useActivity` has finished its first fetch, which reads as
  // "your data is gone." With no empty state, that window looks like a
  // brief blank board instead of a fake "everything is gone" prompt.
  const emptyBoard = missionSearch.hasQuery ? (
    <MissionBoardEmptyState
      isSearch={missionSearch.hasQuery}
      isSearchingText={missionSearch.isSearchingText}
      labels={{
        emptyTitle: t("empty.title"),
        emptyDescription: t("empty.description"),
        newMission: t("empty.newMission"),
        searchEmptyTitle: t("search.emptyTitle"),
        searchEmptyDescription: t("search.emptyDescription"),
        searchSearchingTitle: t("search.searchingTitle"),
        searchSearchingDescription: t("search.searchingDescription"),
        clearSearch: t("search.clearCta"),
      }}
      onNewMission={openDefaultMission}
      onClearSearch={() => setAgentMissionSearchQuery(path, "")}
    />
  ) : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <AIBoard
          items={missionSearch.items}
          columns={boardColumns}
          selectedId={selectedId}
          highlightedId={highlightedId}
          onSelect={setSelectedId}
          panelContainer={panelContainer}
          feedItems={feedItems}
          isLoading={effectiveLoading}
          sessionKeyFor={sessionKeyFor}
          onDelete={handleDelete}
          onApprove={handleApprove}
          onRename={(item, newTitle) => {
            tauriActivity.update(path, item.id, { title: newTitle }).catch(console.error);
          }}
          onCreateConversation={handleCreateConversation}
          onSendMessage={handleSendMessage}
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={(_, id) => messageQueue.removeQueuedMessage(id)}
          queuedLabels={queuedLabels}
          onLoadHistory={loadHistory}
          onHistoryLoaded={handleHistoryLoaded}
          onNewPanelOpenerReady={handleOpenerReady}
          onPanelCloserReady={handleCloserReady}
          emptyState={emptyBoard}
          onPanelOpenChange={setMissionPanelOpen}
          onStopSession={handleStopSession}
          drafts={boardDrafts}
          onDraftChange={handleDraftChange}
          onNotice={handleNotice}
          composerLabels={{
            fileAlreadyInChat: t("chat:composer.fileAlreadyInChat"),
            dropTitle: t("chat:composer.dropTitle"),
            dropDescription: t("chat:composer.dropDescription"),
            imagePasteUnavailable: t("chat:composer.imagePasteUnavailable"),
          }}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          onOpenLink={handleOpenLink}
          actions={agentModes ? cardActions : undefined}
          panelActions={panelActions}
          cardAvatar={<AgentCardAvatar color={agent.color} />}
          thinkingIndicator={<HoustonThinkingIndicator />}
          panelAgentName={agent.name}
          panelAvatar={
            <AgentPanelAvatar
              color={agent.color}
              running={(rawItems ?? []).some((a) => a.id === selectedId && a.status === "running")}
            />
          }
          cardLabels={cardLabels}
          // Per-agent panel features (skill cards, selected Skill, model
          // selector, Skills button, tool/link renderers) all come
          // from the shared `useAgentChatPanel` hook so Mission Control
          // and the per-agent BoardTab share one implementation.
          chatEmptyState={panel.chatEmptyState}
          composerHeader={panel.composerHeader}
          canSendEmpty={panel.canSendEmpty}
          onComposerSubmit={handleComposerSubmit}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          renderSystemMessage={panel.renderSystemMessage}
          mapFeedItems={panel.mapFeedItems}
          afterMessages={panel.afterMessages}
          isSpecialTool={panel.isSpecialTool}
          renderToolResult={panel.renderToolResult}
          renderPendingTool={panel.renderPendingTool}
          processLabels={panel.processLabels}
          getThinkingMessage={panel.getThinkingMessage}
          renderTurnSummary={panel.renderTurnSummary}
          renderLink={panel.renderLink}
        />
      </div>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </div>
  );
}

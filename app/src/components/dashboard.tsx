import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AIBoard } from "@houston-ai/board";
import type { KanbanColumnConfig, KanbanItem, NewPanelOpener } from "@houston-ai/board";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useAgentStore } from "../stores/agents";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useDraftStore } from "../stores/drafts";
import { useUIStore } from "../stores/ui";
import { tauriChat } from "../lib/tauri";
import { openAgentHref } from "../lib/open-href";
import { openMissionWorktreeTerminal } from "../lib/mission-worktree";
import { useMissionControl } from "./use-mission-control";
import { useSessionMessageQueue } from "../hooks/use-session-message-queue";
import { AgentPickerDialog } from "./agent-picker-dialog";
import { useAgentChatPanel } from "./use-agent-chat-panel";
import { useAttachmentRejectionDialog } from "./attachment-rejection-dialog";
import { useQueuedMessageLabels } from "./use-queued-message-labels";
import type { Agent } from "../lib/types";
import { useDetailPanelContainer } from "./shell/detail-panel-context";
import { HoustonThinkingIndicator } from "./shell/experience-card";
import { AgentCardAvatar } from "./shell/agent-card-avatar";
import { AgentPanelAvatar } from "./shell/agent-panel-avatar";
import { MissionControlToolbar } from "./mission-control-toolbar";
import { MissionBoardEmptyState } from "./mission-board-empty-state";
import { useMissionSearch } from "./use-mission-search";
import { buildMissionBoardColumns } from "./mission-board-columns";
import { navigateBoard } from "../lib/board-navigate";
import { planNewMission } from "./mission-control-create";
import {
  missionControlAgentPathForSession,
  missionControlSessionKeyForId,
} from "./mission-control-session";
import {
  MissionWorktreeCardAction,
  MissionWorktreePanelActions,
} from "./mission-worktree-actions";

export function Dashboard() {
  const { t } = useTranslation(["dashboard", "board", "common", "chat"]);
  const queuedLabels = useQueuedMessageLabels();
  // Card-action tooltips (Approve / Rename / Delete) — shared with the
  // per-agent board tab so the affordance reads the same everywhere.
  const cardLabels = {
    approve: t("board:cardActions.approve"),
    approveTooltip: t("board:cardActions.approveTooltip"),
    renameTooltip: t("board:cardActions.renameTooltip"),
    deleteTooltip: t("board:cardActions.deleteTooltip"),
    deleteTitle: (name: string) => t("board:deleteCard.titleWithName", { name }),
    deleteDescription: t("board:deleteCard.description"),
  };
  const panelContainer = useDetailPanelContainer();
  const agents = useAgentStore((s) => s.agents);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const setOnBoardNavigate = useUIStore((s) => s.setOnBoardNavigate);
  const setOnBoardOpen = useUIStore((s) => s.setOnBoardOpen);
  const setOnPanelClose = useUIStore((s) => s.setOnPanelClose);
  const addToast = useUIStore((s) => s.addToast);
  const rawDrafts = useDraftStore((s) => s.drafts);

  const [filterPath, setFilterPath] = useState("");
  const [missionSearchQuery, setMissionSearchQuery] = useState("");
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [newPanelOpenerReady, setNewPanelOpenerReady] = useState(false);
  // Agent the user just picked for "New Mission". Stays in scope until
  // the new conversation is created (and selectedItem takes over) or
  // the user clicks a different card.
  const [pendingAgent, setPendingAgent] = useState<Agent | null>(null);
  const openerRef = useRef<NewPanelOpener | null>(null);
  const closerRef = useRef<(() => void) | null>(null);
  const emptyAutoOpenKeyRef = useRef<string | null>(null);
  const openNewMission = useCallback(() => setAgentPickerOpen(true), [setAgentPickerOpen]);
  useEffect(() => {
    setOnStartMission(openNewMission);
    return () => setOnStartMission(null);
  }, [openNewMission, setOnStartMission]);
  const MC_COLUMNS: KanbanColumnConfig[] = buildMissionBoardColumns(
    {
      running: t("dashboard:columns.running"),
      needsYou: t("dashboard:columns.needsYou"),
      done: t("dashboard:columns.done"),
      newMission: t("dashboard:empty.newMission"),
    },
    openNewMission,
  );

  const mc = useMissionControl(agents);
  const setMissionControlSelectedId = mc.setSelectedId;

  // Keyboard "highlight" — independent of the open panel. Arrow keys
  // move the ring; Enter promotes the ring to the open selection.
  const [highlightedId, setHighlightedId] = useState<string | null>(mc.selectedId);

  // Refs hold the latest snapshot so the navigator we register in the
  // UI store stays stable while always reading the current items,
  // highlight, and column config.
  const navItemsRef = useRef(mc.items);
  const navColumnsRef = useRef(MC_COLUMNS);
  const highlightedIdRef = useRef(highlightedId);
  highlightedIdRef.current = highlightedId;
  navColumnsRef.current = MC_COLUMNS;
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
      if (id) setMissionControlSelectedId(id);
    });
    return () => {
      setOnBoardNavigate(null);
      setOnBoardOpen(null);
    };
  }, [setOnBoardNavigate, setOnBoardOpen, setMissionControlSelectedId]);

  // Register Escape-to-close whenever the panel is open — covers both a
  // selected card AND the empty new-mission panel. For the new-mission
  // case `selectedId` is null and the panel state lives inside AIBoard,
  // so we delegate to the closer AIBoard hands back via
  // `onPanelCloserReady`. Clearing the highlight too on close is a
  // no-op when nothing's selected.
  useEffect(() => {
    if (!missionPanelOpen) {
      setOnPanelClose(null);
      return;
    }
    setOnPanelClose(() => {
      closerRef.current?.();
      setMissionControlSelectedId(null);
    });
    return () => setOnPanelClose(null);
  }, [missionPanelOpen, setOnPanelClose, setMissionControlSelectedId]);

  // Reset the pending agent (set by the New Mission picker) when the
  // panel closes without a card being selected — otherwise the next
  // panel open scopes to a stale agent.
  useEffect(() => {
    if (!missionPanelOpen && !mc.selectedId) {
      setPendingAgent(null);
    }
  }, [missionPanelOpen, mc.selectedId]);

  // Mouse selection (or any external selection change) drags the
  // highlight ring along, so closing the panel leaves it in place.
  useEffect(() => {
    if (mc.selectedId && mc.selectedId !== highlightedIdRef.current) {
      setHighlightedId(mc.selectedId);
    }
  }, [mc.selectedId]);

  // Picking an agent from the "New mission" modal stays on Mission
  // Control: we set the pending agent so the right panel scopes its
  // actions/model/etc. to that agent, then ask AIBoard to open the
  // empty new-conversation panel.
  const handlePickAgent = useCallback((agent: Agent, options?: { focusComposer?: boolean }) => {
    setPendingAgent(agent);
    setMissionControlSelectedId(null);
    openerRef.current?.({ focusComposer: options?.focusComposer ?? true });
  }, [setMissionControlSelectedId]);

  const handleOpenerReady = useCallback((opener: NewPanelOpener) => {
    openerRef.current = opener;
    setNewPanelOpenerReady(true);
  }, []);

  const handleCloserReady = useCallback((close: () => void) => {
    closerRef.current = close;
  }, []);

  const handleStopSession = useCallback(
    (sessionKey: string) => {
      const agentPath = missionControlAgentPathForSession(mc.items, sessionKey);
      if (!agentPath) return;
      tauriChat.stop(agentPath, sessionKey).catch((err) => {
        addToast({
          title: t("dashboard:errors.stopSession", { error: String(err) }),
          variant: "error",
        });
      });
    },
    [mc.items, addToast, t],
  );

  // Build agentPath → color lookup from agent instances
  const colorByPath = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of agents) {
      map[a.folderPath] = a.color;
    }
    return map;
  }, [agents]);

  const agentFilteredItems = useMemo(() => {
    const base = filterPath
      ? mc.items.filter((i) => i.metadata?.agentPath === filterPath)
      : mc.items;
    return base.map((item) => ({
      ...item,
      icon: <AgentCardAvatar color={colorByPath[item.metadata?.agentPath as string]} />,
    }));
  }, [mc.items, filterPath, colorByPath]);
  const visibleAgents = useMemo(
    () => (filterPath ? agents.filter((a) => a.folderPath === filterPath) : agents),
    [agents, filterPath],
  );
  const handleMissionSearchError = useCallback(() => {
    addToast({
      title: t("dashboard:search.historyErrorTitle"),
      description: t("dashboard:search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const missionSearch = useMissionSearch({
    items: agentFilteredItems,
    query: missionSearchQuery,
    loadHistory: mc.loadHistory,
    onHistoryLoadError: handleMissionSearchError,
  });
  // Keep the navigator's items ref aligned with what the board
  // actually renders (filtered + searched), so arrows move through
  // visible cards only.
  navItemsRef.current = missionSearch.items;

  useEffect(() => {
    if (!mc.isLoaded) return;
    if (missionSearch.hasQuery) return;
    const emptyKey = filterPath || "all";
    if (agentFilteredItems.length > 0) {
      if (emptyAutoOpenKeyRef.current === emptyKey) emptyAutoOpenKeyRef.current = null;
      return;
    }
    if (!newPanelOpenerReady || missionPanelOpen || agentPickerOpen) return;
    if (emptyAutoOpenKeyRef.current === emptyKey) return;
    emptyAutoOpenKeyRef.current = emptyKey;
    if (visibleAgents.length === 1) {
      handlePickAgent(visibleAgents[0], { focusComposer: false });
    } else if (visibleAgents.length > 1) {
      setAgentPickerOpen(true);
    }
  }, [
    agentPickerOpen,
    filterPath,
    agentFilteredItems.length,
    handlePickAgent,
    mc.isLoaded,
    missionSearch.hasQuery,
    missionPanelOpen,
    newPanelOpenerReady,
    visibleAgents,
  ]);

  const selectedItem = mc.selectedId
    ? mc.items.find((i) => i.id === mc.selectedId)
    : null;

  // The agent currently scoping the right panel: either the agent the
  // selected card belongs to, or the agent the user picked for a new
  // mission. Drives the per-agent composer features (skills, selected
  // Skill, model selector) provided by `useAgentChatPanel`.
  const activeAgent = useMemo<Agent | null>(() => {
    if (selectedItem) {
      const path = selectedItem.metadata?.agentPath as string | undefined;
      return agents.find((a) => a.folderPath === path) ?? null;
    }
    return pendingAgent;
  }, [selectedItem, pendingAgent, agents]);
  const handleOpenLink = useCallback(
    (url: string) => {
      if (!activeAgent) return;
      openAgentHref(url, activeAgent.folderPath);
    },
    [activeAgent],
  );
  const activeAgentDef = activeAgent ? getAgentDef(activeAgent.configId) ?? null : null;
  const selectedSessionKey = selectedItem
    ? (selectedItem.metadata?.sessionKey as string | undefined) ?? `activity-${selectedItem.id}`
    : null;
  const onActionCreated = useCallback(
    (id: string) => mc.setSelectedId(id),
    [mc],
  );
  const panel = useAgentChatPanel({
    agent: activeAgent,
    agentDef: activeAgentDef,
    selectedSessionKey,
    onSelectSession: onActionCreated,
  });
  const attachmentValidation = useAttachmentRejectionDialog();
  const selectedAgentPath = selectedItem?.metadata?.agentPath as string | undefined;
  const selectedSessionActive = selectedSessionKey
    ? (mc.loading[selectedSessionKey] ?? false)
    : false;
  const sendSelectedNow = useCallback(
    async (text: string, files: File[]) => {
      if (!selectedSessionKey) return;
      await mc.handleSendMessage(selectedSessionKey, text, files);
    },
    [mc.handleSendMessage, selectedSessionKey],
  );
  const messageQueue = useSessionMessageQueue({
    agentPath: selectedAgentPath ?? null,
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
      await mc.handleSendMessage(sessionKey, text, files);
    },
    [mc.handleSendMessage, selectedSessionKey, messageQueue.sendOrQueue],
  );
  const sessionKeyFor = useCallback(
    (activityId: string) => missionControlSessionKeyForId(mc.items, activityId),
    [mc.items],
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
  // Blank "New mission" submit. The new-mission panel only opens after an
  // agent is picked, so `activeAgent` drives the create; the planner keeps
  // the agent/default-mode resolution pure (and unit-tested). Wiring this
  // into AIBoard is the issue #328 fix — Mission Control previously passed
  // no `onCreateConversation`, so a blank submit cleared the composer and
  // did nothing.
  const handleCreateConversation = useCallback(
    async (text: string, files: File[]): Promise<string> => {
      const plan = planNewMission({
        activeAgent,
        activeAgentDef,
        providerOverride: panel.effectiveProvider,
        modelOverride: panel.effectiveModel,
      });
      if (plan.kind === "no-agent") {
        addToast({
          title: t("dashboard:errors.noAgentForMission"),
          variant: "error",
        });
        throw new Error("New mission submitted with no active agent");
      }
      return mc.handleCreateConversation(plan.agent, text, files, {
        agentMode: plan.agentMode,
        promptFile: plan.promptFile,
        providerOverride: plan.providerOverride,
        modelOverride: plan.modelOverride,
      });
    },
    [activeAgent, activeAgentDef, panel.effectiveProvider, panel.effectiveModel, mc.handleCreateConversation, addToast, t],
  );
  const queuedMessages = useMemo(
    () => selectedSessionKey ? { [selectedSessionKey]: messageQueue.queuedMessages } : {},
    [selectedSessionKey, messageQueue.queuedMessages],
  );
  const boardDrafts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawDrafts)) {
      if (value.text) out[key] = value.text;
    }
    return out;
  }, [rawDrafts]);
  const handleDraftChange = useCallback((sessionKey: string, text: string) => {
    useDraftStore.getState().setDraftText(sessionKey, text);
  }, []);
  const handleRunInTerminal = useCallback(
    async (item: KanbanItem) => {
      const wtPath = item.metadata?.worktreePath as string | undefined;
      const agentPath = item.metadata?.agentPath as string | undefined;
      if (!wtPath || !agentPath) return;
      try {
        await openMissionWorktreeTerminal(agentPath, wtPath);
      } catch (err) {
        addToast({
          title: t("board:cardActions.openTerminalFailed", { error: String(err) }),
          variant: "error",
        });
      }
    },
    [addToast, t],
  );
  const cardActions = useCallback(
    (item: KanbanItem) => (
      <MissionWorktreeCardAction
        item={item}
        labels={{
          openTerminal: t("board:cardActions.openTerminal"),
          run: t("board:cardActions.run"),
        }}
        onRun={handleRunInTerminal}
      />
    ),
    [handleRunInTerminal, t],
  );
  const panelActions = useCallback(
    (item: KanbanItem) => (
      <MissionWorktreePanelActions
        item={item}
        labels={{
          openTerminal: t("board:cardActions.openTerminal"),
          run: t("board:cardActions.run"),
        }}
        onRun={handleRunInTerminal}
      />
    ),
    [handleRunInTerminal, t],
  );

  if (agents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("dashboard:noAgents.title")}</EmptyTitle>
            <EmptyDescription>
              {t("dashboard:noAgents.description")}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            className="mt-4 rounded-full"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("dashboard:noAgents.cta")}
          </Button>
        </Empty>
      </div>
    );
  }

  // Only render an empty state when the user is actively searching and
  // got no matches. See the matching comment in board-tab.tsx for why
  // we don't show a "no missions yet" empty state.
  const emptyBoard = missionSearch.hasQuery ? (
    <MissionBoardEmptyState
      isSearch={missionSearch.hasQuery}
      isSearchingText={missionSearch.isSearchingText}
      labels={{
        emptyTitle: t("dashboard:empty.boardTitle"),
        emptyDescription: t("dashboard:empty.boardDescription"),
        newMission: t("dashboard:empty.newMission"),
        searchEmptyTitle: t("dashboard:search.emptyTitle"),
        searchEmptyDescription: t("dashboard:search.emptyDescription"),
        searchSearchingTitle: t("dashboard:search.searchingTitle"),
        searchSearchingDescription: t("dashboard:search.searchingDescription"),
        clearSearch: t("dashboard:search.clearCta"),
      }}
      onNewMission={openNewMission}
      onClearSearch={() => setMissionSearchQuery("")}
    />
  ) : undefined;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <MissionControlToolbar
        agents={agents}
        filterPath={filterPath}
        search={missionSearchQuery}
        isSearchingText={missionSearch.isSearchingText}
        onFilterPathChange={setFilterPath}
        onSearchChange={setMissionSearchQuery}
        onNewMission={openNewMission}
      />

      {/* Board */}
      <div className="flex-1 min-h-0">
        <AIBoard
          items={missionSearch.items}
          columns={MC_COLUMNS}
          selectedId={mc.selectedId}
          highlightedId={highlightedId}
          onSelect={mc.setSelectedId}
          feedItems={mc.feedItems}
          isLoading={mc.loading}
          onDelete={mc.handleDelete}
          onApprove={mc.handleApprove}
          onRename={mc.handleRename}
          onCreateConversation={handleCreateConversation}
          onSendMessage={handleSendMessage}
          sessionKeyFor={sessionKeyFor}
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={(_, id) => messageQueue.removeQueuedMessage(id)}
          queuedLabels={queuedLabels}
          onLoadHistory={mc.loadHistory}
          onHistoryLoaded={mc.handleHistoryLoaded}
          onNewPanelOpenerReady={handleOpenerReady}
          onPanelCloserReady={handleCloserReady}
          emptyState={emptyBoard}
          panelContainer={panelContainer}
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
          actions={cardActions}
          panelActions={panelActions}
          panelAgentName={activeAgent?.name ?? selectedItem?.subtitle}
          panelAvatar={
            <AgentPanelAvatar
              color={activeAgent?.color}
              running={selectedItem?.status === "running"}
            />
          }
          thinkingIndicator={<HoustonThinkingIndicator />}
          cardLabels={cardLabels}
          // Per-agent panel features pulled from the shared hook so
          // Mission Control's right panel matches the BoardTab right
          // panel exactly. Active when `activeAgent` is set (a card is
          // selected OR the user just picked an agent for new mission).
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
          processLabels={panel.processLabels}
          getThinkingMessage={panel.getThinkingMessage}
          renderTurnSummary={panel.renderTurnSummary}
          renderLink={panel.renderLink}
        />
      </div>

      {panel.pickerDialog}
      {attachmentValidation.dialog}

      <AgentPickerDialog
        open={agentPickerOpen}
        onOpenChange={setAgentPickerOpen}
        agents={agents}
        onPick={handlePickAgent}
      />
    </div>
  );
}

import type {
  ChatPanelProps,
  ComposerDraftStore,
  ConversationMapActions,
  FeedItem,
  MessageMention,
  ToolsAndCardsProps,
} from "@houston-ai/chat";
import {
  ChatPanel,
  ConversationActionsMenu,
  feedItemsToMessages,
  hasConversationMoments,
  resolveConversationMapLabels,
} from "@houston-ai/chat";
import { isMobileViewport } from "@houston-ai/core";
import { SplitView } from "@houston-ai/layout";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AIBoardLabels } from "./board-labels";
import {
  composerHasHistory,
  composerPlaceholder,
  DEFAULT_AI_BOARD_LABELS,
} from "./board-labels";
import type { BulkActionBarLabels, BulkMoveTarget } from "./bulk-action-bar";
import { BulkActionBar } from "./bulk-action-bar";
import { type ComposerSendRoutes, routeComposerSend } from "./composer-send";
import { KanbanBoard } from "./kanban-board";
import type { KanbanCardLabels } from "./kanban-card";
import { showsCardAction } from "./kanban-card-actions";
import { KanbanDetailPanel } from "./kanban-detail-panel";
import { KanbanList } from "./kanban-list";
import type { MessageTimeFormatter } from "./message-time";
import { type ResolvedSelection, resolvePanelState } from "./panel-state";
import { shouldDropComposerSend } from "./submit-gate";
import type { BoardSearchSnippet, KanbanColumn, KanbanItem } from "./types";

export interface NewPanelOptions {
  focusComposer?: boolean;
}

export type NewPanelOpener = (options?: NewPanelOptions) => void;

export interface AIBoardProps {
  items: KanbanItem[];
  columns?: KanbanColumn[];
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect?: (id: string | null) => void;
  onDelete?: (item: KanbanItem) => void;
  onApprove?: (item: KanbanItem) => void;
  onArchive?: (item: KanbanItem) => void;
  onCreateConversation?: (
    text: string,
    files: File[],
    mentions?: MessageMention[],
  ) => Promise<string>;
  onSendMessage?: (
    sessionKey: string,
    text: string,
    files: File[],
    mentions?: MessageMention[],
  ) => Promise<void>;
  feedItems?: Record<string, FeedItem[]>;
  isLoading?: Record<string, boolean>;
  emptyState?: ReactNode;
  sessionKeyFor?: (activityId: string) => string;
  runningStatuses?: string[];
  approveStatuses?: string[];
  archiveStatuses?: string[];
  errorStatuses?: string[];
  onLoadHistory?: (sessionKey: string) => Promise<FeedItem[]>;
  onHistoryLoaded?: (sessionKey: string, items: FeedItem[]) => void;
  onNewPanelOpenerReady?: (opener: NewPanelOpener) => void;
  onPanelCloserReady?: (close: () => void) => void;
  onLoadOlderMessages?: () => Promise<unknown>;
  hasOlderMessages?: boolean;
  chatEmptyState?: ReactNode;
  thinkingIndicator?: ReactNode;
  cardAvatar?: ReactNode;
  panelAvatar?: ReactNode;
  panelLeading?: ReactNode;
  panelAgentName?: string;
  panelMissionLabel?: string;
  onPanelOpenChange?: (open: boolean) => void;
  onStopSession?: (sessionKey: string) => void;
  queuedMessages?: Record<
    string,
    NonNullable<ChatPanelProps["queuedMessages"]>
  >;
  onRemoveQueuedMessage?: (sessionKey: string, id: string) => void;
  queuedLabels?: ChatPanelProps["queuedLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  processLabels?: ChatPanelProps["processLabels"];
  getThinkingMessage?: ChatPanelProps["getThinkingMessage"];
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  renderTurnSummary?: import("@houston-ai/chat").ChatPanelProps["renderTurnSummary"];
  renderSystemMessage?: import("@houston-ai/chat").ChatPanelProps["renderSystemMessage"];
  mapFeedItems?: (ctx: { sessionKey: string; items: FeedItem[] }) => FeedItem[];
  afterMessages?:
    | ReactNode
    | ((ctx: { sessionKey: string; feedItems: FeedItem[] }) => ReactNode);
  renderUserMessage?: import("@houston-ai/chat").ChatPanelProps["renderUserMessage"];
  onEditMessage?: import("@houston-ai/chat").ChatPanelProps["onEditMessage"];
  canEditMessage?: import("@houston-ai/chat").ChatPanelProps["canEditMessage"];
  editMessageLabel?: import("@houston-ai/chat").ChatPanelProps["editMessageLabel"];
  enableMessageCopy?: import("@houston-ai/chat").ChatPanelProps["enableMessageCopy"];
  canCopyMessage?: import("@houston-ai/chat").ChatPanelProps["canCopyMessage"];
  copyMessageLabel?: import("@houston-ai/chat").ChatPanelProps["copyMessageLabel"];
  messageEditing?: import("@houston-ai/chat").ChatPanelProps["messageEditing"];
  conversationMap?: ChatPanelProps["conversationMap"];
  onNotice?: (message: string) => void;
  prepareAttachments?: import("@houston-ai/chat").ChatPanelProps["prepareAttachments"];
  onAttachmentRejections?: import("@houston-ai/chat").ChatPanelProps["onAttachmentRejections"];
  onOpenLink?: import("@houston-ai/chat").ChatPanelProps["onOpenLink"];
  renderLink?: import("@houston-ai/chat").ChatPanelProps["renderLink"];
  transformContent?: import("@houston-ai/chat").ChatPanelProps["transformContent"];
  footer?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode);
  composerHeader?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode);
  attachMenu?:
    | ReactNode
    | ((ctx: {
        hasMessages: boolean;
        openFilePicker: () => void;
        openFolderPicker: () => void;
        close: () => void;
      }) => ReactNode);
  canSendEmpty?: boolean;
  onComposerSubmit?: ComposerSendRoutes["onComposerSubmit"];
  onRename?: (item: KanbanItem, newTitle: string) => void;
  actions?: (item: KanbanItem) => React.ReactNode;
  panelActions?: (item: KanbanItem) => React.ReactNode;
  panelTrailing?: ReactNode;
  panelContainer?: HTMLElement | null;
  panelOnly?: boolean;
  disableComposerAutoFocus?: boolean;
  hidePanelClose?: boolean;
  hidePanelHeader?: boolean;
  draftStore?: ComposerDraftStore;
  cardLabels?: KanbanCardLabels;
  formatTime?: MessageTimeFormatter;
  labels?: AIBoardLabels;
  composerAsksOpeningWhenEmpty?: boolean;
  composerOverride?: ReactNode;
  composerOverrideMode?: ChatPanelProps["composerOverrideMode"];
  composerLabels?: ChatPanelProps["composerLabels"];
  currentUserId?: ChatPanelProps["currentUserId"];
  authorLabels?: ChatPanelProps["authorLabels"];
  showSenders?: ChatPanelProps["showSenders"];
  agentLabel?: ChatPanelProps["agentLabel"];
  renderSenderAvatar?: ChatPanelProps["renderSenderAvatar"];
  senderNameClass?: ChatPanelProps["senderNameClass"];
  mentionPeople?: ChatPanelProps["mentionPeople"];
  messageMentionPeople?: ChatPanelProps["messageMentionPeople"];
  renderMentionAvatar?: ChatPanelProps["renderMentionAvatar"];
  mentionLabels?: ChatPanelProps["mentionLabels"];
  dictation?: ChatPanelProps["dictation"];
  layout?: "board" | "list";
  listAlign?: "center" | "left";
  searchSnippets?: Record<string, BoardSearchSnippet>;
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (item: KanbanItem) => void;
  selectionLockColumnId?: string | null;
  bulkActions?: {
    moveTargets: BulkMoveTarget[];
    onMove: (status: string) => void;
    onArchive: () => void;
    onDelete: () => void;
    onClear: () => void;
    labels: BulkActionBarLabels;
  };
  onItemMove?: (item: KanbanItem, toColumnId: string) => void;
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

const defaultSessionKey = (id: string) => `activity-${id}`;

export function AIBoard({
  items,
  columns,
  selectedId: controlledSelectedId,
  highlightedId,
  onSelect: onSelectProp,
  onDelete,
  onApprove,
  onArchive,
  onCreateConversation,
  onSendMessage,
  feedItems = {},
  isLoading = {},
  emptyState,
  sessionKeyFor = defaultSessionKey,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  archiveStatuses = ["done"],
  errorStatuses = ["error"],
  onLoadHistory,
  onHistoryLoaded,
  onNewPanelOpenerReady,
  onPanelCloserReady,
  onLoadOlderMessages,
  hasOlderMessages,
  chatEmptyState,
  thinkingIndicator,
  cardAvatar,
  panelAvatar,
  panelLeading,
  panelAgentName,
  panelMissionLabel,
  onPanelOpenChange,
  onStopSession,
  queuedMessages,
  onRemoveQueuedMessage,
  queuedLabels,
  onRename,
  actions,
  panelActions,
  panelTrailing,
  panelContainer,
  panelOnly,
  disableComposerAutoFocus,
  hidePanelClose,
  hidePanelHeader,
  draftStore,
  isSpecialTool,
  renderToolResult,
  processLabels,
  getThinkingMessage,
  toolLabels,
  renderTurnSummary,
  renderSystemMessage,
  mapFeedItems,
  afterMessages,
  renderUserMessage,
  onEditMessage,
  canEditMessage,
  editMessageLabel,
  enableMessageCopy,
  canCopyMessage,
  copyMessageLabel,
  messageEditing,
  conversationMap,
  onNotice,
  prepareAttachments,
  onAttachmentRejections,
  onOpenLink,
  renderLink,
  transformContent,
  footer,
  composerHeader,
  attachMenu,
  canSendEmpty,
  onComposerSubmit,
  cardLabels,
  formatTime,
  labels,
  composerAsksOpeningWhenEmpty,
  composerOverride,
  composerOverrideMode,
  composerLabels,
  currentUserId,
  mentionPeople,
  messageMentionPeople,
  renderMentionAvatar,
  mentionLabels,
  authorLabels,
  showSenders,
  agentLabel,
  renderSenderAvatar,
  senderNameClass,
  dictation,
  layout = "board",
  listAlign,
  searchSnippets,
  selectable,
  selectedIds,
  onToggleSelect,
  selectionLockColumnId,
  bulkActions,
  onItemMove,
  canDropItem,
}: AIBoardProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    null,
  );
  const [newPanelOpen, setNewPanelOpen] = useState(false);
  const [composerFocusToken, setComposerFocusToken] = useState<number | null>(
    null,
  );

  const selectedId =
    controlledSelectedId !== undefined
      ? controlledSelectedId
      : internalSelectedId;
  const rawSetSelectedId = onSelectProp ?? setInternalSelectedId;

  const hydratedKeys = useRef<Set<string>>(new Set());

  const hydrateSession = useCallback(
    (id: string) => {
      if (!onLoadHistory) return;
      const sk = sessionKeyFor(id);
      if (hydratedKeys.current.has(sk)) return;
      hydratedKeys.current.add(sk);
      onLoadHistory(sk)
        .then((h) => {
          if (h.length > 0) {
            onHistoryLoaded?.(sk, h);
          } else {
            hydratedKeys.current.delete(sk);
          }
        })
        .catch((err) => {
          hydratedKeys.current.delete(sk);
          console.error(err);
        });
    },
    [onLoadHistory, onHistoryLoaded, sessionKeyFor],
  );

  const setSelectedId = useCallback(
    (id: string | null) => {
      rawSetSelectedId(id);
      if (id) hydrateSession(id);
    },
    [rawSetSelectedId, hydrateSession],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only — a second effect (below) handles subsequent selectedId changes; adding deps here would double-hydrate on every selection
  useEffect(() => {
    if (selectedId) hydrateSession(selectedId);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    hydrateSession(selectedId);
    setNewPanelOpen(false);
    if (!disableComposerAutoFocus && !isMobileViewport()) {
      setComposerFocusToken((prev) => (prev ?? 0) + 1);
    }
  }, [selectedId, hydrateSession, disableComposerAutoFocus]);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const lastResolvedRef = useRef<ResolvedSelection | null>(null);
  if (selectedId && selectedItem) {
    lastResolvedRef.current = { id: selectedId, item: selectedItem };
  }

  const openNewPanel = useCallback(
    (options?: NewPanelOptions) => {
      setSelectedId(null);
      setNewPanelOpen(true);
      setComposerFocusToken((current) =>
        options?.focusComposer ? (current ?? 0) + 1 : null,
      );
    },
    [setSelectedId],
  );

  useEffect(() => {
    onNewPanelOpenerReady?.(openNewPanel);
  }, [onNewPanelOpenerReady, openNewPanel]);

  const resolvedColumns = columns ?? DEFAULT_COLUMNS;

  const handleDelete = useCallback(
    (item: KanbanItem) => {
      onDelete?.(item);
      if (selectedId === item.id) setSelectedId(null);
    },
    [onDelete, selectedId, setSelectedId],
  );

  const handleCardSelect = useCallback(
    (item: KanbanItem) => {
      setNewPanelOpen(false);
      setComposerFocusToken(null);
      setSelectedId(item.id);
    },
    [setSelectedId],
  );

  const activeSessionKey = selectedId ? sessionKeyFor(selectedId) : null;
  const effectiveNewPanelOpen =
    newPanelOpen || (panelOnly === true && !selectedId);
  const activeDraftKey = activeSessionKey ?? "new-conversation";
  const rawActiveFeed = activeSessionKey
    ? (feedItems[activeSessionKey] ?? [])
    : [];
  const activeFeed =
    activeSessionKey && mapFeedItems
      ? mapFeedItems({ sessionKey: activeSessionKey, items: rawActiveFeed })
      : rawActiveFeed;

  const sendInFlightRef = useRef(false);
  const handleSend = useCallback(
    async (text: string, files: File[], mentions: MessageMention[]) => {
      if (
        shouldDropComposerSend({
          activeSessionKey,
          sendInFlight: sendInFlightRef.current,
        })
      ) {
        return;
      }
      sendInFlightRef.current = true;
      try {
        const result = await routeComposerSend(
          { onComposerSubmit, onSendMessage, onCreateConversation },
          {
            activeSessionKey,
            canCreate: effectiveNewPanelOpen,
            hasMessages: activeFeed.length > 0,
            text,
            files,
            mentions,
          },
        );
        if (result.kind === "dropped") return;
        draftStore?.set(activeDraftKey, "");
        if (result.kind === "created") setSelectedId(result.activityId);
      } finally {
        sendInFlightRef.current = false;
      }
    },
    [
      onComposerSubmit,
      activeSessionKey,
      activeFeed.length,
      activeDraftKey,
      draftStore,
      onSendMessage,
      effectiveNewPanelOpen,
      onCreateConversation,
      setSelectedId,
    ],
  );
  const activeLoading = activeSessionKey
    ? (isLoading[activeSessionKey] ?? false)
    : false;
  const activeQueuedMessages = activeSessionKey
    ? (queuedMessages?.[activeSessionKey] ?? [])
    : [];
  const renderedAfterMessages =
    typeof afterMessages === "function"
      ? afterMessages({
          sessionKey: activeSessionKey ?? "new-conversation",
          feedItems: rawActiveFeed,
        })
      : afterMessages;

  const { showPanel, panelItem } = resolvePanelState({
    selectedId,
    newPanelOpen: effectiveNewPanelOpen,
    selectedItem,
    lastResolved: lastResolvedRef.current,
  });
  const panelTitle =
    panelItem?.title ??
    (selectedId
      ? ""
      : (labels?.newConversationTitle ??
        DEFAULT_AI_BOARD_LABELS.newConversationTitle));
  const conversationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [findToken, setFindToken] = useState(0);
  const conversationActions: ConversationMapActions | undefined = panelItem
    ? {
        onMoveToDone: showsCardAction({
          itemStatus: panelItem.status,
          actionStatuses: approveStatuses,
          handled: !!onApprove,
          hasCustomActions: !!actions,
        })
          ? () => onApprove?.(panelItem)
          : undefined,
        onDelete: onDelete ? () => handleDelete(panelItem) : undefined,
        deleteTitle:
          cardLabels?.deleteTitle?.(panelItem.title) ??
          `Delete "${panelItem.title}"?`,
        deleteDescription:
          cardLabels?.deleteDescription ??
          "This item and its history will be permanently removed.",
      }
    : undefined;
  const canFindInConversation = useMemo(
    () => hasConversationMoments(feedItemsToMessages(activeFeed)),
    [activeFeed],
  );
  const conversationMapLabels = useMemo(
    () => resolveConversationMapLabels(conversationMap?.labels),
    [conversationMap?.labels],
  );
  const conversationMenu =
    conversationMap &&
    (canFindInConversation ||
      conversationActions?.onDelete ||
      conversationActions?.onMoveToDone) ? (
      <ConversationActionsMenu
        actions={conversationActions}
        canFind={canFindInConversation}
        labels={conversationMapLabels}
        onFind={() => setFindToken((token) => token + 1)}
        triggerRef={conversationTriggerRef}
      />
    ) : null;
  const panelConversationMap = conversationMap
    ? {
        ...conversationMap,
        findToken,
        returnFocusRef: conversationTriggerRef,
      }
    : undefined;

  useEffect(() => {
    onPanelOpenChange?.(showPanel);
  }, [showPanel, onPanelOpenChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally empty deps — this cleanup must run only on unmount with the final onPanelOpenChange ref; re-registering on every render would cause spurious false notifications
  useEffect(() => {
    return () => {
      onPanelOpenChange?.(false);
    };
  }, []);

  const closePanel = useCallback(() => {
    setNewPanelOpen(false);
    setComposerFocusToken(null);
    setSelectedId(null);
  }, [setSelectedId]);

  useEffect(() => {
    onPanelCloserReady?.(closePanel);
  }, [onPanelCloserReady, closePanel]);

  const showBulkBar = selectable && bulkActions && (selectedIds?.size ?? 0) > 0;

  const board = (
    <div className="relative flex flex-col h-full">
      {layout === "list" ? (
        <KanbanList
          items={items}
          selectedId={selectedId}
          onSelect={handleCardSelect}
          onDelete={onDelete ? handleDelete : undefined}
          emptyState={emptyState}
          avatar={cardAvatar}
          cardLabels={cardLabels}
          formatTime={formatTime}
          searchSnippets={searchSnippets}
          align={listAlign}
        />
      ) : (
        <KanbanBoard
          columns={resolvedColumns}
          items={items}
          selectedId={selectedId}
          highlightedId={highlightedId}
          runningStatuses={runningStatuses}
          approveStatuses={approveStatuses}
          archiveStatuses={archiveStatuses}
          errorStatuses={errorStatuses}
          onSelect={handleCardSelect}
          onDelete={onDelete ? handleDelete : undefined}
          onApprove={onApprove}
          onArchive={onArchive}
          onRename={onRename}
          emptyState={emptyState}
          actions={actions}
          avatar={cardAvatar}
          cardLabels={cardLabels}
          formatTime={formatTime}
          selectable={selectable}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          selectionLockColumnId={selectionLockColumnId}
          onItemMove={onItemMove}
          canDropItem={canDropItem}
        />
      )}
      {showBulkBar && bulkActions && (
        <BulkActionBar
          count={selectedIds?.size ?? 0}
          moveTargets={bulkActions.moveTargets}
          onMove={bulkActions.onMove}
          onArchive={bulkActions.onArchive}
          onDelete={bulkActions.onDelete}
          onClear={bulkActions.onClear}
          labels={bulkActions.labels}
        />
      )}
    </div>
  );

  const detailPanel = (
    <KanbanDetailPanel
      title={panelTitle}
      lastMessageAt={panelItem?.lastMessageAt}
      formatTime={formatTime}
      lastMessageLabel={cardLabels?.lastMessage}
      hideHeader={hidePanelHeader}
      onClose={hidePanelClose ? undefined : closePanel}
      leading={panelLeading}
      avatar={panelAvatar}
      agentName={panelAgentName ?? panelItem?.group}
      missionLabelOverride={panelMissionLabel}
      people={panelItem?.people}
      selfId={currentUserId}
      peopleLabel={cardLabels?.people}
      peopleExpandLabel={cardLabels?.peopleExpand}
      closeLabel={cardLabels?.closePanel}
      actions={
        conversationMenu || panelItem || panelTrailing ? (
          <>
            {panelItem ? panelActions?.(panelItem) : null}
            {conversationMenu}
            {panelTrailing}
          </>
        ) : undefined
      }
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatPanel
          sessionKey={activeSessionKey ?? "new-conversation"}
          feedItems={activeFeed}
          isLoading={activeLoading}
          onSend={handleSend}
          onStop={
            activeSessionKey && onStopSession
              ? () => onStopSession(activeSessionKey)
              : undefined
          }
          queuedMessages={activeQueuedMessages}
          onRemoveQueuedMessage={
            activeSessionKey && onRemoveQueuedMessage
              ? (id) => onRemoveQueuedMessage(activeSessionKey, id)
              : undefined
          }
          queuedLabels={queuedLabels}
          placeholder={composerPlaceholder({
            activeSessionKey,
            hasHistory: composerHasHistory({
              asksOpeningWhenEmpty: composerAsksOpeningWhenEmpty === true,
              feedLength: activeFeed.length,
            }),
            labels,
          })}
          emptyState={activeFeed.length === 0 ? chatEmptyState : undefined}
          onLoadOlder={activeSessionKey ? onLoadOlderMessages : undefined}
          hasOlderMessages={hasOlderMessages}
          thinkingIndicator={thinkingIndicator}
          draftStore={draftStore}
          composerFocusToken={
            composerFocusToken !== null ? composerFocusToken : undefined
          }
          isSpecialTool={isSpecialTool}
          renderToolResult={renderToolResult}
          processLabels={processLabels}
          getThinkingMessage={getThinkingMessage}
          toolLabels={toolLabels}
          renderTurnSummary={renderTurnSummary}
          renderSystemMessage={renderSystemMessage}
          renderUserMessage={renderUserMessage}
          onEditMessage={onEditMessage}
          canEditMessage={canEditMessage}
          editMessageLabel={editMessageLabel}
          enableMessageCopy={enableMessageCopy}
          canCopyMessage={canCopyMessage}
          copyMessageLabel={copyMessageLabel}
          messageEditing={messageEditing}
          currentUserId={currentUserId}
          authorLabels={authorLabels}
          showSenders={showSenders}
          agentLabel={agentLabel}
          renderSenderAvatar={renderSenderAvatar}
          senderNameClass={senderNameClass}
          mentionPeople={mentionPeople}
          messageMentionPeople={messageMentionPeople}
          renderMentionAvatar={renderMentionAvatar}
          mentionLabels={mentionLabels}
          conversationMap={panelConversationMap}
          dictation={dictation}
          afterMessages={renderedAfterMessages}
          onNotice={onNotice}
          prepareAttachments={prepareAttachments}
          onAttachmentRejections={onAttachmentRejections}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
          transformContent={transformContent}
          footer={
            typeof footer === "function"
              ? footer({ hasMessages: activeFeed.length > 0 })
              : footer
          }
          composerHeader={
            typeof composerHeader === "function"
              ? composerHeader({ hasMessages: activeFeed.length > 0 })
              : composerHeader
          }
          attachMenu={
            typeof attachMenu === "function"
              ? ({ openFilePicker, openFolderPicker, close }) =>
                  (
                    attachMenu as (ctx: {
                      hasMessages: boolean;
                      openFilePicker: () => void;
                      openFolderPicker: () => void;
                      close: () => void;
                    }) => ReactNode
                  )({
                    hasMessages: activeFeed.length > 0,
                    openFilePicker,
                    openFolderPicker,
                    close,
                  })
              : attachMenu
          }
          canSendEmpty={canSendEmpty}
          composerOverride={composerOverride}
          composerOverrideMode={composerOverrideMode}
          composerLabels={composerLabels}
        />
      </div>
    </KanbanDetailPanel>
  );

  if (panelOnly) {
    return <div className="flex h-full min-h-0 flex-col">{detailPanel}</div>;
  }

  if (!showPanel) {
    return <div className="h-full overflow-hidden">{board}</div>;
  }

  if (panelContainer) {
    return (
      <>
        <div className="h-full overflow-hidden">{board}</div>
        {createPortal(detailPanel, panelContainer)}
      </>
    );
  }

  return (
    <SplitView
      left={board}
      right={detailPanel}
      defaultLeftSize={55}
      defaultRightSize={45}
      minLeftSize={30}
      minRightSize={25}
    />
  );
}

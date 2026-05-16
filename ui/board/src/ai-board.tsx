import { useState, useCallback, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

import { ChatPanel } from "@houston-ai/chat"
import type { ChatPanelProps, FeedItem, ToolsAndCardsProps } from "@houston-ai/chat"
import { SplitView } from "@houston-ai/layout"
import { KanbanBoard } from "./kanban-board"
import { KanbanDetailPanel } from "./kanban-detail-panel"
import type { KanbanCardLabels } from "./kanban-card"
import type { KanbanItem, KanbanColumn } from "./types"

export interface NewPanelOptions {
  focusComposer?: boolean
}

export type NewPanelOpener = (options?: NewPanelOptions) => void

export interface AIBoardProps {
  items: KanbanItem[]
  columns?: KanbanColumn[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onDelete?: (item: KanbanItem) => void
  onApprove?: (item: KanbanItem) => void
  /** Called when user sends the first message in a new conversation. Should return the created activity ID. */
  onCreateConversation?: (text: string, files: File[]) => Promise<string>
  /** Called when user sends a follow-up message in an existing conversation. */
  onSendMessage?: (sessionKey: string, text: string, files: File[]) => Promise<void>
  /** Feed items keyed by session key (e.g. "activity-{id}"). */
  feedItems?: Record<string, FeedItem[]>
  /** Whether a message is currently being processed, keyed by session key. */
  isLoading?: Record<string, boolean>
  /** Custom empty state when the board has no items. */
  emptyState?: ReactNode
  /** Maps an activity ID to its session key. Defaults to `activity-${id}`. */
  sessionKeyFor?: (activityId: string) => string
  runningStatuses?: string[]
  approveStatuses?: string[]
  /** Load persisted chat history for a session. Called once per session key when selected. */
  onLoadHistory?: (sessionKey: string) => Promise<FeedItem[]>
  /** Called with the loaded history so the parent can merge it into its
   * own feed store. This replaces the previous "liveFeed wins if
   * non-empty" hack, which broke when another client (e.g. phone)
   * pushed a live item into a session the user hadn't yet hydrated. */
  onHistoryLoaded?: (sessionKey: string, items: FeedItem[]) => void
  /** Called with the openNewPanel function so the parent can trigger it externally (e.g. from a header button). */
  onNewPanelOpenerReady?: (opener: NewPanelOpener) => void
  /** Custom empty state for the chat panel when no messages exist. */
  chatEmptyState?: ReactNode
  /** Custom thinking indicator for the chat panel. */
  thinkingIndicator?: ReactNode
  /** Avatar element shown on every kanban card (e.g. small agent icon). */
  cardAvatar?: ReactNode
  /** Avatar element shown in the detail panel header. */
  panelAvatar?: ReactNode
  /** Name shown next to the avatar in the panel header (e.g. "Houston"). */
  panelAgentName?: string
  /** Called when the detail panel opens or closes. */
  onPanelOpenChange?: (open: boolean) => void
  /** Called when the user clicks Stop in the chat panel. Receives the active session key. */
  onStopSession?: (sessionKey: string) => void
  /** Queued follow-up messages keyed by session key. */
  queuedMessages?: Record<string, NonNullable<ChatPanelProps["queuedMessages"]>>
  /** Called when the user removes a queued follow-up. */
  onRemoveQueuedMessage?: (sessionKey: string, id: string) => void
  /** Translated labels for queued follow-ups. */
  queuedLabels?: ChatPanelProps["queuedLabels"]
  /** Predicate to identify tools that should use custom rendering. */
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"]
  /** Custom renderer for special tool results. */
  renderToolResult?: ToolsAndCardsProps["renderToolResult"]
  /** Translated labels for the collapsed process/details block. */
  processLabels?: ChatPanelProps["processLabels"]
  /** Translated reasoning text inside the process/details block. */
  getThinkingMessage?: ChatPanelProps["getThinkingMessage"]
  /** Custom tool name → human label mappings. */
  toolLabels?: ToolsAndCardsProps["toolLabels"]
  /** Render prop for an end-of-turn summary (e.g., list of edited files). Forwarded to ChatPanel. */
  renderTurnSummary?: import("@houston-ai/chat").ChatPanelProps["renderTurnSummary"]
  /** Custom renderer for system messages. Forwarded to ChatPanel. */
  renderSystemMessage?: import("@houston-ai/chat").ChatPanelProps["renderSystemMessage"]
  /** Map active feed items before rendering. */
  mapFeedItems?: (ctx: { sessionKey: string; items: FeedItem[] }) => FeedItem[]
  /** Node rendered after the last chat message. */
  afterMessages?: ReactNode | ((ctx: { sessionKey: string; feedItems: FeedItem[] }) => ReactNode)
  /** Custom renderer for user messages. Forwarded to ChatPanel. */
  renderUserMessage?: import("@houston-ai/chat").ChatPanelProps["renderUserMessage"]
  /** Emitted by ChatPanel to surface short notices to the user
   *  (e.g. duplicate-file drop). Forwarded as-is; app decides display. */
  onNotice?: (message: string) => void
  /** Lets apps reject unsupported files before they enter the composer draft. */
  prepareAttachments?: import("@houston-ai/chat").ChatPanelProps["prepareAttachments"]
  /** Emitted when `prepareAttachments` rejects any incoming files. */
  onAttachmentRejections?: import("@houston-ai/chat").ChatPanelProps["onAttachmentRejections"]
  /** Called when the user clicks the open button on an inline link. Forwarded to ChatPanel. */
  onOpenLink?: import("@houston-ai/chat").ChatPanelProps["onOpenLink"]
  /** Custom renderer for markdown links. Forwarded to ChatPanel. */
  renderLink?: import("@houston-ai/chat").ChatPanelProps["renderLink"]
  /**
   * Composer footer content. When a function, called with `{ hasMessages }` so
   * the consumer can lock the provider for active conversations.
   */
  footer?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode)
  /** Content rendered inside the composer above the textarea. */
  composerHeader?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode)
  /** Enables submit even when the composer has no text or files. */
  canSendEmpty?: boolean
  /** Lets consumers handle a submit before the board creates/sends a normal chat message. */
  onComposerSubmit?: (ctx: {
    sessionKey: string | null
    text: string
    files: File[]
    hasMessages: boolean
  }) => boolean | Promise<boolean>
  /** Called when the user renames a card. */
  onRename?: (item: KanbanItem, newTitle: string) => void
  /** Render prop for extra action buttons on each card (e.g. "Run" button). */
  actions?: (item: KanbanItem) => React.ReactNode
  /** Render prop for action buttons in the detail panel header (e.g. worktree info, run button). */
  panelActions?: (item: KanbanItem) => React.ReactNode
  /**
   * DOM element to portal the detail panel into. When provided, the panel
   * renders via createPortal into this element (for app-level layout).
   * When not provided, falls back to SplitView within AIBoard.
   */
  panelContainer?: HTMLElement | null
  /**
   * Draft text keyed by session key. Used to persist composer text across
   * navigation so users don't lose what they've typed. The key
   * "new-conversation" is used for the new-mission panel.
   */
  drafts?: Record<string, string>
  /** Called when the user types in the panel's chat input. */
  onDraftChange?: (sessionKey: string, text: string) => void
  /** Translated label overrides for per-card copy (Approve button + delete confirm). */
  cardLabels?: KanbanCardLabels
  /**
   * When set, replaces the chat composer with this node. Forwarded to
   * ChatPanel. Apps use it to take over the composer space with a
   * focused interaction surface (e.g. an action-input form).
   */
  composerOverride?: ReactNode
  /** Translated labels for the file-drop overlay and composer notices. Forwarded to ChatPanel. */
  composerLabels?: ChatPanelProps["composerLabels"]
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
]

const defaultSessionKey = (id: string) => `activity-${id}`

export function AIBoard({
  items,
  columns,
  selectedId: controlledSelectedId,
  onSelect: onSelectProp,
  onDelete,
  onApprove,
  onCreateConversation,
  onSendMessage,
  feedItems = {},
  isLoading = {},
  emptyState,
  sessionKeyFor = defaultSessionKey,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  onLoadHistory,
  onHistoryLoaded,
  onNewPanelOpenerReady,
  chatEmptyState,
  thinkingIndicator,
  cardAvatar,
  panelAvatar,
  panelAgentName,
  onPanelOpenChange,
  onStopSession,
  queuedMessages,
  onRemoveQueuedMessage,
  queuedLabels,
  onRename,
  actions,
  panelActions,
  panelContainer,
  drafts,
  onDraftChange,
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
  onNotice,
  prepareAttachments,
  onAttachmentRejections,
  onOpenLink,
  renderLink,
  footer,
  composerHeader,
  canSendEmpty,
  onComposerSubmit,
  cardLabels,
  composerOverride,
  composerLabels,
}: AIBoardProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const [newPanelOpen, setNewPanelOpen] = useState(false)
  const [composerFocusToken, setComposerFocusToken] = useState<number | null>(null)

  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId
  const rawSetSelectedId = onSelectProp ?? setInternalSelectedId

  // -- History hydration: load persisted chat when a conversation is
  // selected, once per session. The loaded history is handed to the
  // parent via `onHistoryLoaded` so it lives in the same store as live
  // WS events. Ai-board stays stateless for feed data — single source
  // of truth = the parent's `feedItems`.
  const hydratedKeys = useRef<Set<string>>(new Set())

  const hydrateSession = useCallback(
    (id: string) => {
      if (!onLoadHistory) return
      const sk = sessionKeyFor(id)
      if (hydratedKeys.current.has(sk)) return
      hydratedKeys.current.add(sk)
      onLoadHistory(sk)
        .then((h) => {
          if (h.length > 0) onHistoryLoaded?.(sk, h)
        })
        .catch(console.error)
    },
    [onLoadHistory, onHistoryLoaded, sessionKeyFor],
  )

  const setSelectedId = useCallback(
    (id: string | null) => { rawSetSelectedId(id); if (id) hydrateSession(id) },
    [rawSetSelectedId, hydrateSession],
  )

  // Hydrate on mount if there's an initial controlled selection
  useEffect(() => { if (selectedId) hydrateSession(selectedId) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  const openNewPanel = useCallback((options?: NewPanelOptions) => {
    setSelectedId(null)
    setNewPanelOpen(true)
    setComposerFocusToken((current) => (
      options?.focusComposer ? (current ?? 0) + 1 : null
    ))
  }, [setSelectedId])

  // Expose openNewPanel to parent
  useEffect(() => {
    onNewPanelOpenerReady?.(openNewPanel)
  }, [onNewPanelOpenerReady, openNewPanel])

  const resolvedColumns = columns ?? DEFAULT_COLUMNS

  const handleDelete = useCallback(
    (item: KanbanItem) => {
      onDelete?.(item)
      if (selectedId === item.id) setSelectedId(null)
    },
    [onDelete, selectedId, setSelectedId],
  )

  const handleCardSelect = useCallback(
    (item: KanbanItem) => {
      setNewPanelOpen(false)
      setComposerFocusToken(null)
      setSelectedId(item.id)
    },
    [setSelectedId],
  )

  // Resolve which session key and feed to show (merge persisted history + live items)
  const activeSessionKey = selectedItem ? sessionKeyFor(selectedItem.id) : null
  // The session key currently visible in the detail panel's ChatPanel.
  const activeDraftKey = activeSessionKey ?? "new-conversation"
  const rawActiveFeed = activeSessionKey ? (feedItems[activeSessionKey] ?? []) : []
  const activeFeed = activeSessionKey && mapFeedItems
    ? mapFeedItems({ sessionKey: activeSessionKey, items: rawActiveFeed })
    : rawActiveFeed

  // Unified send handler: creates conversation on first message, sends follow-ups after
  const handleSend = useCallback(
    async (text: string, files: File[]) => {
      const handled = await onComposerSubmit?.({
        sessionKey: activeSessionKey,
        text,
        files,
        hasMessages: activeFeed.length > 0,
      })
      if (handled) {
        onDraftChange?.(activeDraftKey, "")
        return
      }
      if (selectedItem && onSendMessage) {
        await onSendMessage(sessionKeyFor(selectedItem.id), text, files)
        onDraftChange?.(activeDraftKey, "")
      } else if (newPanelOpen && onCreateConversation) {
        const activityId = await onCreateConversation(text, files)
        onDraftChange?.(activeDraftKey, "")
        // Select the new activity so the feed renders. We deliberately
        // leave `newPanelOpen` truthy: there's a brief race where the
        // freshly-created activity isn't yet in `items` (the parent
        // invalidates the activity query asynchronously) and during
        // that window `selectedItem` is still null. Closing
        // `newPanelOpen` here would collapse `showPanel` to false and
        // dismiss the panel mid-create. `newPanelOpen` resets naturally
        // on the next opener call, card select, or outside-click close.
        setSelectedId(activityId)
      }
    },
    [onComposerSubmit, activeSessionKey, activeFeed.length, activeDraftKey, onDraftChange, selectedItem, onSendMessage, sessionKeyFor, newPanelOpen, onCreateConversation, setSelectedId],
  )
  const activeLoading = activeSessionKey ? (isLoading[activeSessionKey] ?? false) : false
  const activeQueuedMessages = activeSessionKey ? (queuedMessages?.[activeSessionKey] ?? []) : []
  const renderedAfterMessages = typeof afterMessages === "function"
    ? afterMessages({
      sessionKey: activeSessionKey ?? "new-conversation",
      feedItems: rawActiveFeed,
    })
    : afterMessages

  const showPanel = selectedItem || newPanelOpen
  const panelTitle = selectedItem?.title ?? "New conversation"

  // Notify parent when panel opens/closes
  useEffect(() => {
    onPanelOpenChange?.(!!showPanel)
  }, [!!showPanel, onPanelOpenChange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure parent resets its "panel open" state when AIBoard unmounts
  // (e.g. tab switch). Without this, portal containers in the app layout
  // would remain visible but empty.
  useEffect(() => {
    return () => {
      onPanelOpenChange?.(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const closePanel = useCallback(() => {
    setNewPanelOpen(false)
    setComposerFocusToken(null)
    setSelectedId(null)
  }, [setSelectedId])

  // Refs for outside-click detection.
  const boardRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Close the panel when the user clicks anywhere outside the board or the
  // detail panel (sidebar, tab bar, other app chrome, etc.).
  useEffect(() => {
    if (!showPanel) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (boardRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (target instanceof Element) {
        // Radix popovers/dropdowns/menus render outside the panel DOM.
        if (target.closest("[data-radix-popper-content-wrapper]")) return
        // Radix Dialog content + overlay also live in a portal outside both
        // refs. Clicking inside a dialog (or its overlay) is the user
        // interacting with a modal we just opened FROM the panel, not an
        // intent to dismiss the panel.
        if (target.closest("[data-slot='dialog-content']")) return
        if (target.closest("[data-slot='dialog-overlay']")) return
        // Generic opt-out: any ancestor with `data-keep-panel-open` is
        // treated as part of the panel's interaction surface (e.g. the
        // top-bar "New mission" button which transitions the panel
        // between selected-chat and new-conversation states).
        if (target.closest("[data-keep-panel-open]")) return
      }
      closePanel()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showPanel, closePanel])

  const board = (
    <div ref={boardRef} className="flex flex-col h-full">
      <KanbanBoard
        columns={resolvedColumns}
        items={items}
        selectedId={selectedId}
        runningStatuses={runningStatuses}
        approveStatuses={approveStatuses}
        onSelect={handleCardSelect}
        onDelete={onDelete ? handleDelete : undefined}
        onApprove={onApprove}
        onRename={onRename}
        emptyState={emptyState}
        actions={actions}
        avatar={cardAvatar}
        cardLabels={cardLabels}
      />
    </div>
  )

  const detailPanel = (
    <KanbanDetailPanel
      ref={panelRef}
      title={panelTitle}
      onClose={closePanel}
      avatar={panelAvatar}
      agentName={panelAgentName ?? selectedItem?.group}
      actions={selectedItem ? panelActions?.(selectedItem) : undefined}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatPanel
          sessionKey={activeSessionKey ?? "new-conversation"}
          feedItems={activeFeed}
          isLoading={activeLoading}
          onSend={handleSend}
          onStop={activeSessionKey && onStopSession ? () => onStopSession(activeSessionKey) : undefined}
          queuedMessages={activeQueuedMessages}
          onRemoveQueuedMessage={
            activeSessionKey && onRemoveQueuedMessage
              ? (id) => onRemoveQueuedMessage(activeSessionKey, id)
              : undefined
          }
          queuedLabels={queuedLabels}
          placeholder={selectedItem ? "Send a follow-up..." : "What should the agent work on?"}
          emptyState={activeFeed.length === 0 ? chatEmptyState : undefined}
          thinkingIndicator={thinkingIndicator}
          value={drafts ? (drafts[activeDraftKey] ?? "") : undefined}
          onValueChange={onDraftChange ? (text: string) => onDraftChange(activeDraftKey, text) : undefined}
          composerFocusToken={
            newPanelOpen && !selectedItem && composerFocusToken !== null
              ? composerFocusToken
              : undefined
          }
          isSpecialTool={isSpecialTool}
          renderToolResult={renderToolResult}
          processLabels={processLabels}
          getThinkingMessage={getThinkingMessage}
          toolLabels={toolLabels}
          renderTurnSummary={renderTurnSummary}
          renderSystemMessage={renderSystemMessage}
          renderUserMessage={renderUserMessage}
          afterMessages={renderedAfterMessages}
          onNotice={onNotice}
          prepareAttachments={prepareAttachments}
          onAttachmentRejections={onAttachmentRejections}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
          footer={typeof footer === "function" ? footer({ hasMessages: activeFeed.length > 0 }) : footer}
          composerHeader={typeof composerHeader === "function" ? composerHeader({ hasMessages: activeFeed.length > 0 }) : composerHeader}
          canSendEmpty={canSendEmpty}
          composerOverride={composerOverride}
          composerLabels={composerLabels}
        />
      </div>
    </KanbanDetailPanel>
  )

  if (!showPanel) {
    return <div className="h-full overflow-hidden">{board}</div>
  }

  // Portal mode: render panel into an app-level container (full-height layout)
  if (panelContainer) {
    return (
      <>
        <div className="h-full overflow-hidden">{board}</div>
        {createPortal(detailPanel, panelContainer)}
      </>
    )
  }

  // Fallback: inline SplitView within AIBoard
  return (
    <SplitView
      left={board}
      right={detailPanel}
      defaultLeftSize={55}
      defaultRightSize={45}
      minLeftSize={30}
      minRightSize={25}
    />
  )
}

import { useState, useCallback, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

import { ChatPanel } from "@houston-ai/chat"
import type { ChatPanelProps, FeedItem, ToolsAndCardsProps } from "@houston-ai/chat"
import { SplitView } from "@houston-ai/layout"
import { KanbanBoard } from "./kanban-board"
import { KanbanList } from "./kanban-list"
import { KanbanDetailPanel } from "./kanban-detail-panel"
import { BulkActionBar } from "./bulk-action-bar"
import type { BulkActionBarLabels, BulkMoveTarget } from "./bulk-action-bar"
import type { KanbanCardLabels } from "./kanban-card"
import type { BoardSearchSnippet, KanbanItem, KanbanColumn } from "./types"

export interface NewPanelOptions {
  focusComposer?: boolean
}

export type NewPanelOpener = (options?: NewPanelOptions) => void

export interface AIBoardProps {
  items: KanbanItem[]
  columns?: KanbanColumn[]
  selectedId?: string | null
  /** Keyboard focus ring (arrow-nav highlight). Separate from selection so
   *  the user can preview the next card without auto-opening the chat. */
  highlightedId?: string | null
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
  errorStatuses?: string[]
  /** Load persisted chat history for a session. Called once per session key when selected. */
  onLoadHistory?: (sessionKey: string) => Promise<FeedItem[]>
  /** Called with the loaded history so the parent can merge it into its
   * own feed store. This replaces the previous "liveFeed wins if
   * non-empty" hack, which broke when another client (e.g. phone)
   * pushed a live item into a session the user hadn't yet hydrated. */
  onHistoryLoaded?: (sessionKey: string, items: FeedItem[]) => void
  /** Called with the openNewPanel function so the parent can trigger it externally (e.g. from a header button). */
  onNewPanelOpenerReady?: (opener: NewPanelOpener) => void
  /** Called with a panel-close function so the parent can dismiss the
   *  detail panel from outside (e.g. global Escape handler). Necessary
   *  for the empty new-mission panel where the parent has no
   *  `selectedId` to clear — `closePanel` here also resets AIBoard's
   *  internal `newPanelOpen` state, which `setSelectedId(null)` does
   *  not touch. */
  onPanelCloserReady?: (close: () => void) => void
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
  /** Transform an assistant message's content before render, optionally
   *  appending an `extra` node after it. Forwarded to ChatPanel. */
  transformContent?: import("@houston-ai/chat").ChatPanelProps["transformContent"]
  /**
   * Composer footer content. When a function, called with `{ hasMessages }` so
   * the consumer can lock the provider for active conversations.
   */
  footer?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode)
  /** Content rendered inside the composer above the textarea. */
  composerHeader?: ReactNode | ((ctx: { hasMessages: boolean }) => ReactNode)
  /** Popover menu anchored to the composer's paperclip button. When a
   *  function, called with `{ hasMessages, openFilePicker, close }` — the
   *  consumer can lock the provider for active conversations, trigger the
   *  file picker from inside the menu, and close the popover. */
  attachMenu?:
    | ReactNode
    | ((ctx: {
        hasMessages: boolean
        openFilePicker: () => void
        close: () => void
      }) => ReactNode)
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
  /** Left-pane layout. "board" = kanban columns (default); "list" = a single
   *  column-less vertical list (used by the Archived missions tab). */
  layout?: "board" | "list"
  /** Sizing of the "list" layout rail. "center" (default) keeps the list as a
   *  fixed-width centered column; "left" fills the full pane width, left-aligned
   *  (the wide Archived views). Ignored in "board" layout. */
  listAlign?: "center" | "left"
  /** Per-item matched body fragment (keyed by `KanbanItem.id`) shown below a row
   *  when the search matched in the body/history rather than the title. Applied
   *  in the "list" layout. */
  searchSnippets?: Record<string, BoardSearchSnippet>
  /** Enable per-card multi-select checkboxes (board layout only). */
  selectable?: boolean
  /** Ids currently in the multi-select set. */
  selectedIds?: ReadonlySet<string>
  /** Toggle a card's membership in the multi-select set. */
  onToggleSelect?: (item: KanbanItem) => void
  /** When a selection is active, locks selection to this column id — cards in
   *  other columns hide their checkbox so a selection can't span sections. */
  selectionLockColumnId?: string | null
  /** Floating bulk-action bar config. Rendered when `selectable` and at
   *  least one card is selected. */
  bulkActions?: {
    moveTargets: BulkMoveTarget[]
    onMove: (status: string) => void
    onArchive: () => void
    onDelete: () => void
    onClear: () => void
    labels: BulkActionBarLabels
  }
  /** Called when a card is dropped onto a different column (board layout
   *  only). Receives the dragged item and the target column id. Providing
   *  this enables drag-and-drop between columns. */
  onItemMove?: (item: KanbanItem, toColumnId: string) => void
  /** Override which columns accept a given dragged item. See
   *  `KanbanBoardProps.canDropItem`. */
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean
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
  highlightedId,
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
  errorStatuses = ["error"],
  onLoadHistory,
  onHistoryLoaded,
  onNewPanelOpenerReady,
  onPanelCloserReady,
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
  transformContent,
  footer,
  composerHeader,
  attachMenu,
  canSendEmpty,
  onComposerSubmit,
  cardLabels,
  composerOverride,
  composerLabels,
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

  // When the selection changes from OUTSIDE (e.g. arrow-key navigation
  // sets selectedId via the controlled prop, or session-notifications
  // jumps to a different mission), hydrate the new session, close any
  // "new mission" panel, and bump the composer focus token so the user
  // can start typing immediately without reaching for the mouse.
  useEffect(() => {
    if (!selectedId) return
    hydrateSession(selectedId)
    setNewPanelOpen(false)
    setComposerFocusToken((prev) => (prev ?? 0) + 1)
  }, [selectedId, hydrateSession])

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

  // Expose closer to parent so external triggers (global Escape, etc.)
  // can dismiss the panel without needing to know whether it's a
  // selected-card panel or the empty new-mission panel.
  useEffect(() => {
    onPanelCloserReady?.(closePanel)
  }, [onPanelCloserReady, closePanel])

  // Refs for outside-click detection.
  const boardRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Close the panel when the user clicks anywhere outside the board or
  // the detail panel (sidebar, tab bar, other app chrome, etc.).
  //
  // We listen for `pointerdown` at the CAPTURE phase rather than
  // `mousedown` at bubble. Two reasons:
  //  1. Radix DismissableLayer (used by every popover / dropdown /
  //     select / menu) dismisses on `pointerdown`. By the time a
  //     bubble-phase `mousedown` fires, Radix has already called
  //     `onOpenChange(false)`, flipped `data-state` to "closed", and —
  //     when the component has no exit animation — unmounted the
  //     popper wrapper entirely. Any "is a popper currently open"
  //     check we run from `mousedown` is too late: the DOM no longer
  //     shows one.
  //  2. Capture phase runs root → target. By listening at capture on
  //     `document`, we see the event before any descendant handler
  //     (including Radix's, which is registered later on the layer
  //     after the popper opens). At that moment the popper is still
  //     open with `data-state="open"`, so we can detect it reliably.
  useEffect(() => {
    if (!showPanel) return
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (boardRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (target instanceof Element) {
        // Clicks INSIDE a Radix popper (its portal lives outside the
        // panel DOM) — the user is interacting with a menu we opened
        // from the panel, not dismissing the panel itself.
        if (target.closest("[data-radix-popper-content-wrapper]")) return
        // Any Radix popper currently open (anywhere in the document)
        // intercepts this pointerdown as its own dismiss gesture. The
        // panel should not also close — Radix dismisses the popper,
        // user can decide whether to dismiss the panel with a follow-
        // up click. Because we're at capture phase + pointerdown,
        // Radix hasn't flipped `data-state` yet, so the open selector
        // matches.
        if (document.querySelector('[data-state="open"][data-slot$="-content"]')) return
        // Belt-and-suspenders fallback for non-shadcn-styled poppers
        // that don't carry the `data-slot$="-content"` marker but
        // still use Radix Popper under the hood.
        if (document.querySelector("[data-radix-popper-content-wrapper]")) return
        // Radix Dialog content + overlay also live in a portal outside
        // both refs. Clicking inside a dialog (or its overlay) is the
        // user interacting with a modal we just opened FROM the panel,
        // not an intent to dismiss the panel.
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
    document.addEventListener("pointerdown", handler, true)
    return () => document.removeEventListener("pointerdown", handler, true)
  }, [showPanel, closePanel])

  const showBulkBar =
    selectable && bulkActions && (selectedIds?.size ?? 0) > 0

  const board = (
    <div ref={boardRef} className="relative flex flex-col h-full">
      {layout === "list" ? (
        <KanbanList
          items={items}
          selectedId={selectedId}
          onSelect={handleCardSelect}
          onDelete={onDelete ? handleDelete : undefined}
          emptyState={emptyState}
          avatar={cardAvatar}
          cardLabels={cardLabels}
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
          errorStatuses={errorStatuses}
          onSelect={handleCardSelect}
          onDelete={onDelete ? handleDelete : undefined}
          onApprove={onApprove}
          onRename={onRename}
          emptyState={emptyState}
          actions={actions}
          avatar={cardAvatar}
          cardLabels={cardLabels}
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
          afterMessages={renderedAfterMessages}
          onNotice={onNotice}
          prepareAttachments={prepareAttachments}
          onAttachmentRejections={onAttachmentRejections}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
          transformContent={transformContent}
          footer={typeof footer === "function" ? footer({ hasMessages: activeFeed.length > 0 }) : footer}
          composerHeader={typeof composerHeader === "function" ? composerHeader({ hasMessages: activeFeed.length > 0 }) : composerHeader}
          attachMenu={
            typeof attachMenu === "function"
              ? ({ openFilePicker, close }) =>
                  (attachMenu as Extract<typeof attachMenu, Function>)({
                    hasMessages: activeFeed.length > 0,
                    openFilePicker,
                    close,
                  })
              : attachMenu
          }
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

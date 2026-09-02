import type { KanbanItem, NewPanelOpener } from "@houston-ai/board";
import type { FeedItem, MessageMention } from "@houston-ai/chat";
import type { ReactNode } from "react";
import type { HistoryLoadOptions } from "../../lib/tauri";
import type { TurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";

/**
 * Shared mission-board architecture.
 *
 * `<MissionBoard>` owns every piece of wiring a cross-agent board needs: the
 * AIBoard prop spread, the `useAgentChatPanel` integration, the message queue,
 * draft persistence, keyboard navigation, the bulk-action UI, columns, and all
 * i18n labels.
 *
 * The scope-dependent parts — where the data comes from, who the active agent
 * is, how a new mission is started, and how bulk mutations are routed to the
 * right agent — live behind this `BoardSource` interface, which
 * `useMissionControlSource` builds. This is the headless-logic pattern: one
 * presentational/wiring component, an injected data backend. Mission Control
 * and each team board are the SAME source narrowed by a
 * `MissionControlScope`, so they never drift apart.
 */

/** Everything a user-typed send carries beside its text and files: the
 *  provider/model pair (so the wire mirrors the model the composer dropdown is
 *  showing, never silently re-resolved by the engine), the turn-mode pin, and
 *  the teammates the message named. */
export interface SendOverrides {
  providerOverride: string;
  modelOverride: string;
  /** Turn mode pin for user-typed sends; absent = execute. */
  modeOverride?: TurnMode;
  /** Teammates this message @mentions (HOU-944). Per-send, not a composer
   *  setting: it comes from the submit, not the toolbar. Absent on an
   *  agent-initiated send (retry, auto-resume, routine). */
  mentions?: MessageMention[];
}

/**
 * Multi-select state + bulk mutations for one board. The set-state half is
 * generic (see `useSelectionSet`); the bulk dispatch (`move` / `archive` /
 * `remove`) groups the selection by agent before writing, because one
 * cross-agent selection can span several agents. The section lock, toggle
 * guard, header actions, and bulk-bar labels are derived by `<MissionBoard>`
 * and stay out of here.
 */
export interface BoardSelectionModel {
  selectedIds: ReadonlySet<string>;
  /** Add/remove a single card. The shared component applies the section-lock
   *  guard before calling this. */
  toggle: (item: KanbanItem) => void;
  /** Add a whole section's ids to the selection (the column header
   *  "Select all in column"). Additive + idempotent — deselect is the bulk
   *  bar's "Clear", never this. */
  selectAll: (ids: string[]) => void;
  clear: () => void;
  /** Move every selected card to `status` (a bulk move target). */
  move: (status: string) => Promise<void>;
  /** Archive every selected card. */
  archive: () => Promise<void>;
  /** Delete every selected card. */
  remove: () => Promise<void>;
}

/**
 * Everything the shared `<MissionBoard>` needs that depends on the board's
 * scope. Anything that can be derived from these fields (panel avatar,
 * columns, section lock, labels) is built by the component, not duplicated
 * here.
 */
export interface BoardSource {
  // ── Data ──────────────────────────────────────────────────────────────────
  /** Already filtered + searched: exactly what renders on the board. */
  items: KanbanItem[];
  /** In-scope active missions BEFORE search is applied. Drives the
   *  multi-select section lock and the Done "archive all" / Needs-you
   *  "select all" header actions, which act on the whole section regardless
   *  of the current search. */
  allItems: KanbanItem[];
  feedItems: Record<string, FeedItem[]>;
  loading: Record<string, boolean>;
  isLoaded: boolean;

  // ── Open-chat selection + keyboard highlight ──────────────────────────────
  // Owned by the source, not the component: the open mission's session key
  // and owning agent are resolved from the swept data, which only the source
  // holds.
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;

  // ── Panel scope (the agent whose chat features the right panel shows) ─────
  activeAgent: Agent | null;
  /**
   * Scope for the new-conversation composer draft (HOU-730): a per-board
   * constant (Mission Control, or one per team board), so a parked first
   * message survives switching the target agent but never surfaces in another
   * board's composer.
   */
  draftScope: string;
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  /** Called with a new conversation id after the panel creates one (Skill
   *  start or a routed action). */
  onSelectSession: (id: string) => void;

  // ── Session helpers ───────────────────────────────────────────────────────
  sessionKeyFor: (activityId: string) => string;

  // ── Mutations (routed to the right agent inside the source) ───────────────
  onDelete: (item: KanbanItem) => void | Promise<void>;
  onApprove: (item: KanbanItem) => void | Promise<void>;
  /** The Done card's archive box: files a signed-off mission away. Removes the
   *  card from the active board, so the source also drops it from the open
   *  panel the way a delete / bulk archive does. */
  onArchive: (item: KanbanItem) => void | Promise<void>;
  onRename: (item: KanbanItem, title: string) => void;
  /**
   * Persisted chat history for one conversation. Callers forward `opts`:
   * mission search bulk-loads with `observe: false` (no per-conversation
   * observer streams, bounded scan window); the board's open-a-chat hydration
   * omits it (observes, tail window).
   */
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  /** Scroll-up lazy-load for the OPEN chat (HOU-819): prepend the previous
   *  transcript page of the active conversation. */
  onLoadOlderMessages?: () => Promise<unknown>;
  /** Older messages exist beyond the open chat's loaded window. */
  hasOlderMessages?: boolean;
  /** Raw send (no queue). `overrides` carry the composer's effective
   *  provider/model; the per-agent source uses them, Mission Control resolves
   *  its own from the target activity. */
  sendMessageNow: (
    sessionKey: string,
    text: string,
    files: File[],
    overrides: SendOverrides,
  ) => Promise<void>;
  /** Create a new conversation for the active agent and return its id. */
  createConversation: (
    args: { text: string; files: File[] } & SendOverrides,
  ) => Promise<string>;
  stopSession: (sessionKey: string) => void;

  // ── Drag & drop ───────────────────────────────────────────────────────────
  onItemMove?: (item: KanbanItem, toColumnId: string) => void;
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean;

  // ── Multi-select + bulk (optional) ────────────────────────────────────────
  selection?: BoardSelectionModel;

  // ── New mission ───────────────────────────────────────────────────────────
  /** Receives AIBoard's "open the new-mission panel" function. */
  registerOpener: (opener: NewPanelOpener) => void;
  /** True once `registerOpener` has run (gates the empty-board auto-open). */
  openerReady: boolean;
  /** What the toolbar / empty-state "New mission" button triggers. */
  openNewMission: () => void;
  /** The phone's compose for THIS board (`phone-compose.ts`): the Running
   *  page's leading "+" below md, scoped to the board's own agents and landing
   *  in a pushed chat, never the desktop side composer. */
  composeOnPhone: () => void;
  /** Auto-open the new-mission panel when the in-scope board is empty. */
  onAutoOpenEmpty: () => void;
  /** Identity of the current empty scope (agent path / filter) so the
   *  auto-open fires once per scope. */
  autoOpenKey: string;
  /** In-scope mission count ignoring search (drives the empty auto-open). */
  autoOpenItemCount: number;
  /** Extra guard that suppresses the auto-open (e.g. a picker is open). */
  autoOpenBlocked: boolean;

  // ── Search ────────────────────────────────────────────────────────────────
  hasSearchQuery: boolean;
  /** Rendered as AIBoard's empty state when (and only when) a search returned
   *  nothing. Built by the source because the label namespaces differ. */
  emptyState?: ReactNode;

  // ── Presentation ──────────────────────────────────────────────────────────
  /** Name shown beside the detail-panel avatar (the active agent's name). */
  panelAgentName?: string;
  /** Whether the open mission is running (drives the panel avatar's status
   *  dot). Resolved against the full in-scope set so a search that hides the
   *  open card doesn't drop the indicator. */
  selectedRunning: boolean;

  // ── Slots rendered by the component ───────────────────────────────────────
  /** Toolbar rendered above the board (filters, search, New mission).
   *  Desktop-only: the component hides it below md, where
   *  {@link BoardSource.mobileControls} takes over. */
  toolbar?: ReactNode;
  /** The phone board's control row (sticky search, agent filter, archived),
   *  rendered above the paged board below md only. */
  mobileControls?: ReactNode;
  /** Dialogs mounted alongside the board (agent picker, attachment rejection,
   *  skill picker). */
  dialogs?: ReactNode;
}

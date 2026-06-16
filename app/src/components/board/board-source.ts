import type { ReactNode } from "react";
import type { KanbanItem, NewPanelOpener } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import type { Agent, AgentDefinition } from "../../lib/types";

/**
 * Shared mission-board architecture.
 *
 * `<MissionBoard>` owns every piece of wiring that the cross-agent Mission
 * Control view and the per-agent board tab used to duplicate: the AIBoard
 * prop spread, the `useAgentChatPanel` integration, the message queue,
 * draft persistence, keyboard navigation, the bulk-action UI, columns, and
 * all i18n labels.
 *
 * The genuinely divergent parts — where the data comes from, who the active
 * agent is, how a new mission is started, and how bulk mutations are routed
 * to the right agent — live behind this `BoardSource` interface. Each view
 * builds a source with a hook (`useAgentBoardSource` / `useMissionControlSource`)
 * and hands it to the shared component. This is the headless-logic pattern:
 * one presentational/wiring component, two injected data backends.
 */

/** Provider/model override pair, forwarded to a send/create so the wire
 *  mirrors the model the composer dropdown is showing (never silently
 *  re-resolved by the engine). */
export interface SendOverrides {
  providerOverride: string;
  modelOverride: string;
}

/**
 * Multi-select state + bulk mutations for one board. The set-state half is
 * identical for both views (see `useSelectionSet`); only the bulk dispatch
 * (`move` / `archive` / `remove` / `archiveIds`) differs — per-agent for the
 * board tab, grouped-by-agent for cross-agent Mission Control. The section
 * lock, toggle guard, header actions, and bulk-bar labels are derived by
 * `<MissionBoard>` and stay out of here.
 */
export interface BoardSelectionModel {
  selectedIds: ReadonlySet<string>;
  /** Add/remove a single card. The shared component applies the section-lock
   *  guard before calling this. */
  toggle: (item: KanbanItem) => void;
  /** Toggle a whole section's ids at once (the column header "select all"). */
  toggleAll: (ids: string[]) => void;
  clear: () => void;
  /** Move every selected card to `status` (a bulk move target). */
  move: (status: string) => Promise<void>;
  /** Archive every selected card. */
  archive: () => Promise<void>;
  /** Delete every selected card. */
  remove: () => Promise<void>;
  /** Archive an explicit id list (the Done column "archive all"), independent
   *  of the current selection. */
  archiveIds: (ids: string[]) => Promise<void>;
}

/**
 * Everything the shared `<MissionBoard>` needs that differs between the
 * cross-agent and per-agent views. Anything that can be derived from these
 * fields (panel avatar, columns, section lock, labels) is built by the
 * component, not duplicated here.
 */
export interface BoardSource {
  variant: "mission-control" | "agent";

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
  // Owned by the source because the per-agent board reconciles both across
  // agent switches; Mission Control never switches agent.
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;

  // ── Panel scope (the agent whose chat features the right panel shows) ─────
  activeAgent: Agent | null;
  activeAgentDef: AgentDefinition | null;
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  selectedSessionActive: boolean;
  /** Called with a new conversation id after the panel creates one (Skill
   *  start or a routed action). */
  onSelectSession: (id: string) => void;

  // ── Session helpers ───────────────────────────────────────────────────────
  sessionKeyFor: (activityId: string) => string;

  // ── Mutations (routed to the right agent inside the source) ───────────────
  onDelete: (item: KanbanItem) => void | Promise<void>;
  onApprove: (item: KanbanItem) => void | Promise<void>;
  onRename: (item: KanbanItem, title: string) => void;
  loadHistory: (sessionKey: string) => Promise<FeedItem[]>;
  onHistoryLoaded: (sessionKey: string, items: FeedItem[]) => void;
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

  // ── Drag & drop (per-agent board only) ────────────────────────────────────
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
  /** Per-card avatar for the per-agent board. Mission Control sets a per-card
   *  `icon` on each item instead and leaves this undefined. */
  cardAvatar?: ReactNode;

  // ── Slots rendered by the component ───────────────────────────────────────
  /** Toolbar rendered above the board (Mission Control only). */
  toolbar?: ReactNode;
  /** Dialogs mounted alongside the board (agent picker, attachment rejection,
   *  skill picker). */
  dialogs?: ReactNode;
}

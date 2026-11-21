import type { GrantableOperation } from "@houston/protocol";
import type { KanbanItem, NewPanelOpener } from "@houston-ai/board";
import type { FeedItem, MessageMention } from "@houston-ai/chat";
import type { ReactNode } from "react";
import type { HistoryLoadOptions } from "../../lib/tauri";
import type { TurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import type { FirstDayPlacement } from "../first-day/first-day-model";
import type { BoardSelectionModel } from "./board-selection-model";

export interface SendOverrides {
  providerOverride: string;
  modelOverride: string;
  effortOverride?: string;
  modeOverride?: TurnMode;
  mentions?: MessageMention[];
  grants?: GrantableOperation[];
  sentForPerson?: true;
}

export type NewConversationArgs = {
  text: string;
  files: File[];
  conversationId?: string;
} & SendOverrides;

export interface BoardSource {
  items: KanbanItem[];
  allItems: KanbanItem[];
  feedItems: Record<string, FeedItem[]>;
  loading: Record<string, boolean>;
  isLoaded: boolean;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;

  activeAgent: Agent | null;
  draftScope: string;
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  onSelectSession: (id: string) => void;

  sessionKeyFor: (activityId: string) => string;

  onDelete: (item: KanbanItem) => void;
  onApprove: (item: KanbanItem) => void;
  onArchive: (item: KanbanItem) => void;
  onRename: (item: KanbanItem, title: string) => void;
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  onLoadOlderMessages?: () => Promise<unknown>;
  hasOlderMessages?: boolean;
  sendMessageNow: (
    sessionKey: string,
    text: string,
    files: File[],
    overrides: SendOverrides,
  ) => Promise<void>;
  createConversation: (args: NewConversationArgs) => Promise<string>;
  stopSession: (sessionKey: string) => void;

  onItemMove?: (item: KanbanItem, toColumnId: string) => void;
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean;

  selection?: BoardSelectionModel;

  registerOpener: (opener: NewPanelOpener) => void;
  openerReady: boolean;
  openNewMission: () => void;
  onAutoOpenEmpty: () => void;
  autoOpenKey: string;
  autoOpenItemCount: number;
  autoOpenBlocked: boolean;

  search: {
    query: string;
    setQuery: (query: string) => void;
    isSearchingText: boolean;
  };
  hasSearchQuery: boolean;
  emptyState?: ReactNode;

  panelAgentName?: string;
  selectedRunning: boolean;

  firstDay: FirstDayPlacement<Agent>;

  toolbar?: ReactNode;
  dialogs?: ReactNode;
}

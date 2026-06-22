import type React from "react";
import type { HighlightRange } from "@houston-ai/core";

export interface KanbanItem {
  id: string;
  title: string;
  description?: string;
  subtitle?: string;
  /** Grouping label displayed above the title (e.g. agent name). */
  group?: string;
  /** Small pill labels shown at the bottom of the card. */
  tags?: string[];
  status: string;
  updatedAt: string;
  icon?: React.ReactNode;
  metadata?: Record<string, unknown>;
}

/** A matched body fragment shown below a board item during search. `text` is
 *  the display string; `ranges` index into it for highlighting. Keyed by
 *  `KanbanItem.id` and passed to the list via `searchSnippets`. */
export interface BoardSearchSnippet {
  text: string;
  ranges: HighlightRange[];
}

/** A unified conversation entry — either the primary chat or an activity conversation. */
export interface ConversationEntry {
  id: string;
  title: string;
  status?: string;
  /** `"primary"` for the agent's main chat, `"activity"` for activity conversations. */
  type: "primary" | "activity";
  /** Session key used to address this conversation (e.g. `"main"`, `"activity-{id}`). */
  sessionKey: string;
  updatedAt?: string;
  /** Absolute path to the agent folder this conversation belongs to. */
  agentPath: string;
  /** Human-readable agent name. */
  agentName: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  statuses: string[];
  /** Show a "+" button after the column's cards. */
  onAdd?: () => void;
  /** Accessible label for the add button. */
  addLabel?: string;
  /** Node rendered on the right of the column header (e.g. an
   *  "archive all" icon button). Fully owned by the consumer so any
   *  confirm dialog / i18n stays out of the library. */
  headerAction?: React.ReactNode;
}

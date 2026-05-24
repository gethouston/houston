import type React from "react";

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
}

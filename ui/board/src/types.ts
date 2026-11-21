import type { HighlightRange } from "@houston-ai/core";
import type React from "react";

export interface KanbanPerson {
  id: string;
  label: string;
  imageUrl?: string;
}

export interface KanbanItem {
  id: string;
  title: string;
  description?: string;
  subtitle?: string;
  group?: string;
  tags?: string[];
  status: string;
  lastMessageAt: string;
  icon?: React.ReactNode;
  metadata?: Record<string, unknown>;
  people?: KanbanPerson[];
}

export interface BoardSearchSnippet {
  text: string;
  ranges: HighlightRange[];
}

export interface ConversationEntry {
  id: string;
  title: string;
  status?: string;
  type: "primary" | "activity";
  sessionKey: string;
  updatedAt?: string;
  agentPath: string;
  agentName: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  statuses: string[];
  onAdd?: () => void;
  addLabel?: string;
  addAttrs?: Record<string, string>;
  headerAction?: React.ReactNode;
}

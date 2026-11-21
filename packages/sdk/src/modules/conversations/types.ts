import type { ConversationSummary } from "@houston/runtime-client";

export interface ConversationListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface ConversationListVM {
  loaded: boolean;
  items: ConversationListItem[];
}

export function conversationListScope(agentId: string): string {
  return `conversations/${agentId}`;
}

export function toListItem(summary: ConversationSummary): ConversationListItem {
  const item: ConversationListItem = {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
  if (summary.lastMessage !== undefined) item.lastMessage = summary.lastMessage;
  return item;
}

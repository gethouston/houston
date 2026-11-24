import type { ConversationSummary } from "@houston/runtime-client";

/** One row in an agent's conversation list. Mirrors {@link ConversationSummary}. */
export interface ConversationListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Preview of the most recent message, when the engine supplies one. */
  lastMessage?: string;
}

/** Snapshot published under `conversations/<agentId>`. */
export interface ConversationListVM {
  /** `true` once a fetch has resolved; `false` while loading / never fetched. */
  loaded: boolean;
  /** Conversations for the agent, in the order the engine returned them. */
  items: ConversationListItem[];
}

/**
 * Scope string a consumer passes to `sdk.subscribe(...)` / `sdk.getSnapshot(...)`
 * to observe one agent's conversation list. Centralized so callers never
 * hand-format the string and risk a typo.
 */
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

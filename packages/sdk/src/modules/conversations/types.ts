/**
 * View-model shapes and scope helpers for the conversation-LIST module.
 *
 * The VM mirrors {@link ConversationSummary} field-for-field but is mapped
 * explicitly (never spread) so the snapshot shape stays stable even if the wire
 * summary grows new fields — only what a list UI needs crosses the boundary.
 * Everything here is plain JSON (see `store.ts` "snapshots, not patches").
 */

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

/** Project a wire {@link ConversationSummary} into a {@link ConversationListItem}. */
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

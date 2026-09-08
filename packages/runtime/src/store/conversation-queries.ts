import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationHistory,
  ConversationSummary,
} from "@houston/runtime-client";
import { loadConversation } from "./conversation-file";
import { readParsedFile } from "./conversation-parse-cache";

/**
 * The read side of the conversation store: a windowed transcript and the
 * one-line-per-conversation list. Both go through the parse cache, so a query
 * costs a stat per file and parses only what changed since the last read.
 */

/**
 * A transcript window request: `limit` = max messages returned, `before` = the
 * absolute index the window must end at (exclusive) — the caller's current
 * `offset`, for fetching the previous page. Both optional; absent = full
 * history (the pre-windowing contract, unchanged for old clients).
 */
export interface HistoryWindow {
  limit?: number;
  before?: number;
}

export function getHistoryAt(
  dir: string,
  id: string,
  window: HistoryWindow = {},
): ConversationHistory | null {
  const conv = loadConversation(dir, id);
  if (!conv) return null;
  const total = conv.messages.length;
  const end = Math.min(Math.max(window.before ?? total, 0), total);
  const start =
    window.limit === undefined ? 0 : Math.max(0, end - window.limit);
  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages.slice(start, end),
    offset: start,
    totalMessages: total,
  };
}

export function listConversationsAt(dir: string): ConversationSummary[] {
  if (!existsSync(dir)) return [];
  const out: ConversationSummary[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const conv = readParsedFile(join(dir, f));
    if (!conv) continue; // unreadable/foreign file — skipped
    const last = conv.messages[conv.messages.length - 1];
    out.push({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      lastMessage: last?.content.slice(0, 80),
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

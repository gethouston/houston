import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationHistory,
  ConversationSummary,
} from "@houston/runtime-client";
import { sliceTranscript, totalMessageCount } from "./conversation-archive";
import { loadConversation, type StoredConversation } from "./conversation-file";
import { readParsedSummary } from "./conversation-parse-cache";

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
  // Indexes are absolute across the archive segments and the live tail
  // (conversation-archive.ts), so a page before the tail reads a segment.
  const total = totalMessageCount(conv);
  const end = Math.min(Math.max(window.before ?? total, 0), total);
  const start =
    window.limit === undefined ? 0 : Math.max(0, end - window.limit);
  return {
    id: conv.id,
    title: conv.title,
    messages: sliceTranscript(dir, conv, start, end),
    offset: start,
    totalMessages: total,
  };
}

function summarize(conv: StoredConversation): ConversationSummary {
  const last = conv.messages[conv.messages.length - 1];
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    lastMessage: last?.content.slice(0, 80),
  };
}

export function listConversationsAt(dir: string): ConversationSummary[] {
  if (!existsSync(dir)) return [];
  const out: ConversationSummary[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    // The summary, not the transcript: a list never needs the messages, and
    // the derived digest stays cached even for a transcript too large for
    // the parse cache's byte budget to keep.
    const summary = readParsedSummary(join(dir, f), summarize);
    if (!summary) continue; // unreadable/foreign file — skipped
    out.push(summary);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The whole transcript, segments included, as one conversation object — the
 * shape a reader that must see everything (the transcript shadow's repair)
 * expects. `archived` is dropped: the result IS the full message list.
 */
export function loadFullConversation(
  dir: string,
  id: string,
): StoredConversation | null {
  const conv = loadConversation(dir, id);
  if (!conv?.archived) return conv;
  const { archived: _, ...rest } = conv;
  return {
    ...rest,
    messages: sliceTranscript(dir, conv, 0, totalMessageCount(conv)),
  };
}

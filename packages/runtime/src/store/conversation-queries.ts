import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationHistory,
  ConversationSummary,
} from "@houston/runtime-client";
import { sliceTranscript, totalMessageCount } from "./conversation-archive";
import type { MissingSegment } from "./conversation-archive-missing";
import { historyBounds } from "./conversation-archive-window";
import { loadConversation, type StoredConversation } from "./conversation-file";
import { readParsedSummary } from "./conversation-parse-cache";

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
  const total = totalMessageCount(conv);
  const { start, end } = historyBounds(total, window);
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
    const summary = readParsedSummary(join(dir, f), summarize);
    if (!summary) continue;
    out.push(summary);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadFullConversation(
  dir: string,
  id: string,
  missing: MissingSegment = "throw",
): StoredConversation | null {
  const conv = loadConversation(dir, id);
  if (!conv?.archived) return conv;
  const { archived: _, ...rest } = conv;
  return {
    ...rest,
    messages: sliceTranscript(dir, conv, 0, totalMessageCount(conv), missing),
  };
}

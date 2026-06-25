import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ChatMessage,
  ConversationHistory,
  ConversationSummary,
  TokenUsage,
  ToolCallRecord,
} from "@houston/runtime-client";
import { config } from "../config";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
  listConversationsAt,
  renameConversationAt,
} from "./conversation-file";

/**
 * Config-bound conversation store for the long-lived server: one JSON file per
 * conversation under dataDir/conversations/. This is the durable, UI-facing
 * transcript and the source of truth for history + listing — intentionally
 * decoupled from pi's internal session format so the datastore can be swapped
 * later. The pure file logic lives in conversation-file.ts (shared with the
 * per-turn cloud runtime, which binds it to a hydrated tmpdir instead).
 */

const dir = join(config.dataDir, "conversations");
mkdirSync(dir, { recursive: true });

export function appendUserMessage(id: string, content: string) {
  appendUserMessageAt(dir, id, content);
}

export function appendAssistantMessage(
  id: string,
  content: string,
  tools?: ToolCallRecord[],
  usage?: TokenUsage | null,
  providerSwitch?: ChatMessage["providerSwitch"],
  providerError?: ChatMessage["providerError"],
) {
  appendAssistantMessageAt(
    dir,
    id,
    content,
    tools,
    usage,
    providerSwitch,
    providerError,
  );
}

export function getHistory(id: string): ConversationHistory | null {
  return getHistoryAt(dir, id);
}

export function listConversations(): ConversationSummary[] {
  return listConversationsAt(dir);
}

export function renameConversation(id: string, title: string): boolean {
  return renameConversationAt(dir, id, title);
}

export function deleteConversation(id: string): boolean {
  return deleteConversationAt(dir, id);
}

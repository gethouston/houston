import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationHistory,
  ConversationSummary,
} from "@houston/runtime-client";
import { config } from "../config";
import {
  type AssistantMessageMeta,
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
  type HistoryWindow,
  listConversationsAt,
  renameConversationAt,
  type UserMessageMeta,
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

export function appendUserMessage(
  id: string,
  content: string,
  meta?: UserMessageMeta,
) {
  appendUserMessageAt(dir, id, content, meta);
}

export function appendAssistantMessage(
  id: string,
  content: string,
  meta?: AssistantMessageMeta,
) {
  appendAssistantMessageAt(dir, id, content, meta);
}

/**
 * Append the durable stop marker: an empty assistant message flagged
 * `stopped`, which retires a pending interaction exactly the way a real Stop
 * does — the SDK renders it as the "Stopped by user" system line and a history
 * reload settles the turn as stopped instead of re-deriving a clean `done`.
 */
export function markConversationStopped(id: string): void {
  appendAssistantMessage(id, "", { stopped: true });
}

export function getHistory(
  id: string,
  window?: HistoryWindow,
): ConversationHistory | null {
  return getHistoryAt(dir, id, window);
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

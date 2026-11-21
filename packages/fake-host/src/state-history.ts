import {
  type ConversationImportRequest,
  holdsImport,
  importedMessages,
} from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { EPOCH, emitDomain, SEED_USAGE, state } from "./state-store";

export function getHistory(
  agentId: string,
  conversationId: string,
): ChatMessage[] {
  return state.histories.get(`${agentId}:${conversationId}`) ?? [];
}
export function seedHistory(
  agentId: string,
  conversationId: string,
  messages: ChatMessage[],
): ChatMessage[] {
  state.histories.set(`${agentId}:${conversationId}`, [...messages]);
  emitDomain("ConversationsChanged", agentId);
  return messages;
}

export function appendUserMessage(
  agentId: string,
  conversationId: string,
  userText: string,
  turnId: string,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({
    role: "user",
    content: userText,
    ts: EPOCH,
    turnId,
    ...(displayText !== undefined ? { displayText } : {}),
    ...(mentions ? { mentions } : {}),
  });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}

export function appendStoppedMessage(
  agentId: string,
  conversationId: string,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({ role: "assistant", content: "", ts: EPOCH, stopped: true });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}

export function truncateHistory(
  agentId: string,
  conversationId: string,
  turnId: string,
): boolean {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  const at = list.findIndex((m) => m.turnId === turnId);
  if (at === -1) return false;
  state.histories.set(key, list.slice(0, at));
  emitDomain("ConversationsChanged", agentId);
  return true;
}

export function importHistory(
  agentId: string,
  conversationId: string,
  request: ConversationImportRequest,
): number {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  if (holdsImport(list, request.importId)) return 0;
  const imported = importedMessages(request, EPOCH);
  state.histories.set(
    key,
    request.at === "start" ? [...imported, ...list] : [...list, ...imported],
  );
  emitDomain("ConversationsChanged", agentId);
  return imported.length;
}

export function appendAssistantMessage(
  agentId: string,
  conversationId: string,
  replyText: string,
  turnId: string,
  pendingInteraction: ChatMessage["pendingInteraction"] | null = null,
  tools: NonNullable<ChatMessage["tools"]> = [],
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({
    role: "assistant",
    content: replyText,
    ts: EPOCH,
    usage: SEED_USAGE,
    turnId,
    ...(pendingInteraction ? { pendingInteraction } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}

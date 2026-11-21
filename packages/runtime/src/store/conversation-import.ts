import {
  type ConversationImportRequest,
  holdsImport,
  importedMessages,
} from "@houston/protocol";
import {
  loadConversation,
  type StoredConversation,
  saveConversation,
} from "./conversation-file";
import { loadFullConversation } from "./conversation-queries";

export function importConversationMessagesAt(
  dir: string,
  id: string,
  request: ConversationImportRequest,
): number {
  const now = Date.now();
  const existing = loadConversation(dir, id);
  if (existing && alreadyImported(dir, existing, request.importId)) return 0;
  const conv: StoredConversation = existing ?? {
    id,
    title: request.messages[0].content.slice(0, 60),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  if (request.at === "start") {
    const first = conv.messages[0]?.ts;
    const messages = importedMessages(request, (first ?? now + 1) - 1);
    conv.messages.unshift(...messages);
    return finish(dir, conv, now, messages.length);
  }
  const messages = importedMessages(request, now);
  conv.messages.push(...messages);
  return finish(dir, conv, now, messages.length);
}

function finish(
  dir: string,
  conv: StoredConversation,
  now: number,
  written: number,
): number {
  delete conv.claudeCompaction;
  conv.needsSessionReplay = true;
  conv.updatedAt = now;
  saveConversation(dir, conv);
  return written;
}

function alreadyImported(
  dir: string,
  conv: StoredConversation,
  importId: string,
): boolean {
  if (holdsImport(conv.messages, importId)) return true;
  if (!conv.archived) return false;
  const full = loadFullConversation(dir, conv.id, "report");
  return full !== null && holdsImport(full.messages, importId);
}

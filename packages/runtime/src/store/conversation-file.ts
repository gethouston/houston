import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import {
  ARCHIVE_TRIGGER_BYTES,
  archiveOlderMessages,
  totalMessageCount,
} from "./conversation-archive";
import { removeArchive } from "./conversation-archive-cut";
import type { UserMessageMeta } from "./conversation-message-meta";
import {
  dropParsedFile,
  readParsedFile,
  stampParsedFile,
} from "./conversation-parse-cache";
import type { StoredConversation } from "./stored-conversation";

export { appendAssistantMessageAt } from "./conversation-append-assistant";
export type {
  AssistantMessageMeta,
  UserMessageMeta,
} from "./conversation-message-meta";
export {
  getHistoryAt,
  type HistoryWindow,
  listConversationsAt,
  loadFullConversation,
} from "./conversation-queries";
export type {
  CompactionCheckpoint,
  StoredConversation,
} from "./stored-conversation";

const fileFor = (dir: string, id: string) =>
  join(dir, `${encodeURIComponent(id)}.json`);

export function loadConversation(
  dir: string,
  id: string,
): StoredConversation | null {
  const f = fileFor(dir, id);
  const conv = readParsedFile(f);
  if (conv && liveFileSize(f) > ARCHIVE_TRIGGER_BYTES) save(dir, conv);
  return conv;
}

function liveFileSize(f: string): number {
  try {
    return statSync(f).size;
  } catch {
    return 0;
  }
}

export function saveConversation(dir: string, conv: StoredConversation) {
  save(dir, conv);
}

function save(dir: string, conv: StoredConversation) {
  mkdirSync(dir, { recursive: true });
  const f = fileFor(dir, conv.id);
  const tmp = atomicTempPath(f);
  let json = JSON.stringify(conv);
  if (json.length > ARCHIVE_TRIGGER_BYTES && archiveOlderMessages(dir, conv))
    json = JSON.stringify(conv);
  writeFileSync(tmp, json);
  renameSync(tmp, f);
  stampParsedFile(f, conv);
}

export function appendUserMessageAt(
  dir: string,
  id: string,
  content: string,
  meta: UserMessageMeta = {},
) {
  const now = Date.now();
  const conv: StoredConversation = loadConversation(dir, id) ?? {
    id,
    title: content.slice(0, 60) || "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const expectedCount = totalMessageCount(conv);
  const needsSessionReplay = conv.needsSessionReplay === true;
  conv.messages.push({
    role: "user",
    content,
    ts: now,
    author: meta.author,
    turnId: meta.turnId,
    nonce: meta.nonce,
    displayText: meta.displayText,
    mentions: meta.mentions?.length ? meta.mentions : undefined,
  });
  conv.updatedAt = now;
  save(dir, conv);
  return {
    conversation: conv,
    message: conv.messages[conv.messages.length - 1] as ChatMessage,
    expectedCount,
    needsSessionReplay,
  };
}

export function renameConversationMutationAt(
  dir: string,
  id: string,
  title: string,
): StoredConversation | null {
  const conv = loadConversation(dir, id);
  if (!conv) return null;
  conv.title = title;
  conv.updatedAt = Date.now();
  save(dir, conv);
  return conv;
}

export function deleteConversationAt(dir: string, id: string): boolean {
  const f = fileFor(dir, id);
  dropParsedFile(f);
  removeArchive(dir, id);
  if (!existsSync(f)) return false;
  rmSync(f);
  return true;
}

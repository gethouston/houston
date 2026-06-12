import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type {
  ChatMessage,
  ConversationHistory,
  ConversationSummary,
  ToolCallRecord,
} from "@houston/runtime-client";

/**
 * Pure, dir-parameterized conversation file logic: one JSON file per
 * conversation under <dir>/<id>.json. The long-lived server binds it to
 * config.dataDir (store/conversations.ts); the per-turn cloud runtime binds it
 * to a hydrated tmpdir per request. Same atomic-write, same shapes.
 */

export type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const fileFor = (dir: string, id: string) => join(dir, `${encodeURIComponent(id)}.json`);

export function loadConversation(dir: string, id: string): StoredConversation | null {
  const f = fileFor(dir, id);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as StoredConversation;
  } catch {
    return null;
  }
}

function save(dir: string, conv: StoredConversation) {
  mkdirSync(dir, { recursive: true });
  const f = fileFor(dir, conv.id);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(conv));
  renameSync(tmp, f); // atomic swap; never leaves a half-written file
}

export function appendUserMessageAt(dir: string, id: string, content: string) {
  const now = Date.now();
  const conv: StoredConversation = loadConversation(dir, id) ?? {
    id,
    title: content.slice(0, 60) || "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conv.messages.push({ role: "user", content, ts: now });
  conv.updatedAt = now;
  save(dir, conv);
}

export function appendAssistantMessageAt(
  dir: string,
  id: string,
  content: string,
  tools?: ToolCallRecord[],
) {
  const conv = loadConversation(dir, id);
  if (!conv) return;
  conv.messages.push({
    role: "assistant",
    content,
    ts: Date.now(),
    tools: tools && tools.length ? tools : undefined,
  });
  conv.updatedAt = Date.now();
  save(dir, conv);
}

export function renameConversationAt(dir: string, id: string, title: string): boolean {
  const conv = loadConversation(dir, id);
  if (!conv) return false;
  conv.title = title;
  conv.updatedAt = Date.now();
  save(dir, conv);
  return true;
}

export function deleteConversationAt(dir: string, id: string): boolean {
  const f = fileFor(dir, id);
  if (!existsSync(f)) return false;
  rmSync(f);
  return true;
}

export function getHistoryAt(dir: string, id: string): ConversationHistory | null {
  const conv = loadConversation(dir, id);
  if (!conv) return null;
  return { id: conv.id, title: conv.title, messages: conv.messages };
}

export function listConversationsAt(dir: string): ConversationSummary[] {
  if (!existsSync(dir)) return [];
  const out: ConversationSummary[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const conv = JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredConversation;
      const last = conv.messages[conv.messages.length - 1];
      out.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: last?.content.slice(0, 80),
      });
    } catch {
      // skip unreadable files
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

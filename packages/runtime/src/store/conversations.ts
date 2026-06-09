import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { config } from "../config";
import type {
  ChatMessage,
  ConversationHistory,
  ConversationSummary,
  ToolCallRecord,
} from "@houston/runtime-client";

/**
 * File-backed conversation store: one JSON file per conversation under
 * dataDir/conversations/. This is the durable, UI-facing transcript and the
 * source of truth for history + listing — intentionally decoupled from pi's
 * internal session format so the datastore can be swapped later (DB/privacy).
 */

type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const dir = join(config.dataDir, "conversations");
mkdirSync(dir, { recursive: true });

const fileFor = (id: string) => join(dir, `${encodeURIComponent(id)}.json`);

function load(id: string): StoredConversation | null {
  const f = fileFor(id);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as StoredConversation;
  } catch {
    return null;
  }
}

function save(conv: StoredConversation) {
  const f = fileFor(conv.id);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(conv));
  renameSync(tmp, f); // atomic swap; never leaves a half-written file
}

export function appendUserMessage(id: string, content: string) {
  const now = Date.now();
  const conv: StoredConversation = load(id) ?? {
    id,
    title: content.slice(0, 60) || "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conv.messages.push({ role: "user", content, ts: now });
  conv.updatedAt = now;
  save(conv);
}

export function appendAssistantMessage(
  id: string,
  content: string,
  tools?: ToolCallRecord[],
) {
  const conv = load(id);
  if (!conv) return;
  conv.messages.push({
    role: "assistant",
    content,
    ts: Date.now(),
    tools: tools && tools.length ? tools : undefined,
  });
  conv.updatedAt = Date.now();
  save(conv);
}

export function getHistory(id: string): ConversationHistory | null {
  const conv = load(id);
  if (!conv) return null;
  return { id: conv.id, title: conv.title, messages: conv.messages };
}

export function listConversations(): ConversationSummary[] {
  const out: ConversationSummary[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const conv = JSON.parse(
        readFileSync(join(dir, f), "utf8"),
      ) as StoredConversation;
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

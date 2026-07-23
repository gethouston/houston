import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ChatMessage,
  ConversationHistory,
  ConversationSummary,
  TokenUsage,
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

const fileFor = (dir: string, id: string) =>
  join(dir, `${encodeURIComponent(id)}.json`);

export function loadConversation(
  dir: string,
  id: string,
): StoredConversation | null {
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

/** Optional fields of a persisted user message. */
export interface UserMessageMeta {
  author?: ChatMessage["author"];
  /** The turn's wire id (`WireFrame.turnId`) — same on the assistant reply. */
  turnId?: string;
  /**
   * The bubble text to render when it must differ from `content` (the real
   * prompt the model ran on). Presentation-only; persisted so a history reload
   * renders `displayText ?? content`. Omitted when the two are the same string.
   */
  displayText?: string;
}

/** Optional fields of a persisted assistant message. */
export interface AssistantMessageMeta {
  tools?: ToolCallRecord[];
  /** The turn's reasoning text, replayed into the mission log on reload (HOU-717). */
  thinking?: string;
  usage?: TokenUsage | null;
  providerSwitch?: ChatMessage["providerSwitch"];
  compaction?: ChatMessage["compaction"];
  providerError?: ChatMessage["providerError"];
  /** Files the turn created/modified (relative paths); omitted when empty. */
  fileChanges?: ChatMessage["fileChanges"];
  /**
   * What the turn ended waiting on the user for — set ONLY on a clean turn (the
   * caller mirrors the `done`-frame condition). Persisted so a client that
   * missed the live `done` and settles from history lands on `needs_you`
   * instead of a false `done`.
   */
  pendingInteraction?: ChatMessage["pendingInteraction"];
  /**
   * Set when the user STOPPED this turn — persisted so the standard "Stopped by
   * user" line survives a history reload and the reload derivation settles the
   * turn to `needs_you` instead of a false `done`. Absent on completed turns.
   */
  stopped?: true;
  /** The turn's wire id (`WireFrame.turnId`) — same as the user message's. */
  turnId?: string;
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
  // Stamp the author (C5) only when a token identified one — a single-user /
  // local turn omits the field entirely, keeping the stored record
  // byte-identical to today. `turnId` matches the live stream's frames so a
  // client can pair refetched history with a turn it watched.
  conv.messages.push({
    role: "user",
    content,
    ts: now,
    author: meta.author,
    turnId: meta.turnId,
    // Presentation-only: kept out of `content` so the model input is unchanged.
    displayText: meta.displayText,
  });
  conv.updatedAt = now;
  save(dir, conv);
}

export function appendAssistantMessageAt(
  dir: string,
  id: string,
  content: string,
  meta: AssistantMessageMeta = {},
) {
  const conv = loadConversation(dir, id);
  if (!conv) return;
  conv.messages.push({
    role: "assistant",
    content,
    ts: Date.now(),
    tools: meta.tools?.length ? meta.tools : undefined,
    thinking: meta.thinking || undefined,
    usage: meta.usage ?? undefined,
    providerSwitch: meta.providerSwitch,
    compaction: meta.compaction,
    providerError: meta.providerError,
    fileChanges: meta.fileChanges,
    pendingInteraction: meta.pendingInteraction,
    stopped: meta.stopped,
    turnId: meta.turnId,
  });
  conv.updatedAt = Date.now();
  save(dir, conv);
}

export function renameConversationAt(
  dir: string,
  id: string,
  title: string,
): boolean {
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

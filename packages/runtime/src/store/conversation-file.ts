import {
  existsSync,
  mkdirSync,
  readdirSync,
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
import {
  dropParsedFile,
  readParsedFile,
  stampParsedFile,
} from "./conversation-parse-cache";

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
  /**
   * Set when the backend-native session state was deliberately reset while the
   * transcript kept messages (a truncation's edit-and-resend, PRODUCT-1217):
   * the next turn must carry the kept transcript into its fresh session as a
   * replay preamble (HOU-951). One-shot — exec-turn consumes it. Durable here
   * (not in-memory) so a runtime restart between the reset and the next turn
   * cannot lose the carried context.
   */
  needsSessionReplay?: true;
};

const fileFor = (dir: string, id: string) =>
  join(dir, `${encodeURIComponent(id)}.json`);

/**
 * Reads go through the mtime/size-validated parse cache
 * (`conversation-parse-cache.ts`, HOU-819): a hit costs a stat instead of a
 * whole-file JSON.parse on the event loop; writers that bypass {@link save}
 * (the cloud store-sync hydrating `/data`, a manual edit) are picked up on
 * the next read. The cached object is the SAME reference the appenders
 * mutate-then-save — never mutate a loaded conversation without saving it.
 */
export function loadConversation(
  dir: string,
  id: string,
): StoredConversation | null {
  return readParsedFile(fileFor(dir, id));
}

/**
 * Persist a (mutated) conversation atomically. Exported for the sibling
 * truncate module (conversation-truncate.ts) — every writer must go through
 * here so the parse cache is re-stamped with what landed on disk.
 */
export function saveConversation(dir: string, conv: StoredConversation) {
  save(dir, conv);
}

function save(dir: string, conv: StoredConversation) {
  mkdirSync(dir, { recursive: true });
  const f = fileFor(dir, conv.id);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(conv));
  renameSync(tmp, f); // atomic swap; never leaves a half-written file
  stampParsedFile(f, conv);
}

/** Optional fields of a persisted user message. */
export interface UserMessageMeta {
  author?: ChatMessage["author"];
  /**
   * The teammates the message @mentions (HOU-944). Structure only: the model
   * ran on the plain "@Name" text either way. Omitted when the message mentions
   * nobody, so a single-player record stays byte-identical to today.
   */
  mentions?: ChatMessage["mentions"];
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
   * What the turn ended on — a question / connect the user has to answer, or a
   * pure clean-finish offer. Set ONLY on a clean turn (the caller mirrors the
   * `done`-frame condition). Persisted so a client that missed the live `done`
   * and settles from history still renders the card it would have shown.
   */
  pendingInteraction?: ChatMessage["pendingInteraction"];
  /**
   * Set when the user STOPPED this turn — persisted so the standard "Stopped by
   * user" line survives a history reload and the reload derivation renders the
   * interruption instead of a plain successful finish. Absent on completed
   * turns.
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
  const expectedCount = conv.messages.length;
  const needsSessionReplay = conv.needsSessionReplay === true;
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
    // Same posture as `author`: an empty list is omitted entirely (never `[]`),
    // so a message that mentions nobody keeps the record byte-identical.
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
  return {
    conversation: conv,
    message: conv.messages[conv.messages.length - 1] as ChatMessage,
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
    // Path-keyed cached read: a list pass costs one stat per file and parses
    // only files that actually changed since the last read — it used to
    // re-parse EVERY transcript on every call.
    const conv = readParsedFile(join(dir, f));
    if (!conv) continue; // unreadable/foreign file — skip, as before
    const last = conv.messages[conv.messages.length - 1];
    out.push({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      lastMessage: last?.content.slice(0, 80),
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

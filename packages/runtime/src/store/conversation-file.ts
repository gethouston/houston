import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import {
  ARCHIVE_TRIGGER_BYTES,
  type ArchiveIndex,
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
  /**
   * The durable half of a Claude `/compact`: the summary the NEXT prompt opens
   * its fresh session with, written BEFORE the resume mapping is dropped and
   * removed only once that prompt succeeds (`conversation-compaction.ts`). On
   * disk so a restart, an eviction or a mode switch between the two cannot lose
   * the compacted history.
   */
  claudeCompaction?: CompactionCheckpoint;
  /**
   * Present once older messages were rotated into segment files beside this
   * one (`conversation-archive.ts`): `messages` is then only the recent tail,
   * and this records what the segments hold. Absent on every conversation
   * that never outgrew the live-file budget — byte-identical to before.
   */
  archived?: ArchiveIndex;
};

/** A compaction summary waiting to be carried into the next prompt. */
export interface CompactionCheckpoint {
  summary: string;
  createdAt: number;
}

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
  const f = fileFor(dir, id);
  const conv = readParsedFile(f);
  // A transcript that outgrew the budget BEFORE rotation existed (or was
  // written by a writer that bypasses save) rotates on its first load, so a
  // pod that was dying on it heals itself at boot: one last whole parse, then
  // never again.
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
  let json = JSON.stringify(conv);
  // Past the budget, rotate the older messages out (mutates `conv`, which is
  // also the cached object) and write the tail that remains.
  if (json.length > ARCHIVE_TRIGGER_BYTES && archiveOlderMessages(dir, conv))
    json = JSON.stringify(conv);
  writeFileSync(tmp, json);
  renameSync(tmp, f); // atomic swap; never leaves a half-written file
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
  // Absolute, segments included: the transcript shadow compares it against
  // the remote copy's whole count, not the live tail.
  const expectedCount = totalMessageCount(conv);
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

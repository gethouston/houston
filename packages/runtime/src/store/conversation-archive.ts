import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { LruCache } from "../lru";
import type { StoredConversation } from "./conversation-file";

/**
 * Transcript archiving: a conversation that never ends (a `shared` routine
 * chat runs for months) keeps ONE live file that is re-parsed and re-written
 * whole on every append. At 165 MB that cost the runtime over a gigabyte of
 * resident memory per turn and OOM-killed its pod 87 times in a day.
 *
 * Past a size budget the live file keeps only the recent tail; everything
 * older moves into immutable, numbered segment files beside it:
 *
 *   <dir>/<id>.json             the tail + `archived` (what the segments hold)
 *   <dir>/<id>.archive/1.json   the oldest messages
 *   <dir>/<id>.archive/2.json   ...
 *
 * Message indexes stay ABSOLUTE across the whole transcript (segments first,
 * then the tail), so history paging, `totalMessages`, and edit-and-resend see
 * the same conversation as before — a reader that only knows the live file
 * (an older runtime, the parse cache) sees a valid, shorter one. Autocompact
 * bounds the model's context, never storage; this bounds storage.
 */

const MiB = 1024 * 1024;

/** Live file size past which an append rotates the older messages out. */
export const ARCHIVE_TRIGGER_BYTES = 8 * MiB;

/**
 * What the live file keeps after a rotation. Comfortably above the replay
 * preamble's budget (replay-transcript.ts, ~0.8 × a 200k window ≈ 640 KB of
 * text), so a backend switch still carries the same recent history it would
 * have carried from an un-rotated file.
 */
export const ARCHIVE_TAIL_BYTES = 2 * MiB;

/** What the live file records about its segments (additive, optional). */
export interface ArchiveIndex {
  /** Messages held by every segment together — the tail's absolute offset. */
  messages: number;
  /** Message count per segment, in segment order (segment n = index n-1). */
  segments: number[];
}

interface SegmentFile {
  id: string;
  segment: number;
  messages: ChatMessage[];
}

export function archiveDirFor(dir: string, id: string): string {
  return join(dir, `${encodeURIComponent(id)}.archive`);
}

export const segmentFileFor = (dir: string, id: string, n: number) =>
  join(archiveDirFor(dir, id), `${n}.json`);

export function archivedMessageCount(conv: StoredConversation): number {
  return conv.archived?.messages ?? 0;
}

export function totalMessageCount(conv: StoredConversation): number {
  return archivedMessageCount(conv) + conv.messages.length;
}

/**
 * The index of the first message that STAYS in the live file when the tail
 * must fit `tailBytes`: the newest messages that fit, opened at the user
 * message of a turn so a turn is never split across files (a turn that only
 * partly fits is archived whole). The newest turn always stays, even when it
 * alone exceeds the budget. 0 means nothing would move.
 */
export function tailCutIndex(
  messages: ChatMessage[],
  tailBytes: number,
): number {
  let bytes = 0;
  let fits = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    bytes += JSON.stringify(messages[i]).length;
    if (bytes > tailBytes) break;
    fits = i;
  }
  if (fits === messages.length) {
    // Nothing fits: keep the newest turn regardless.
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    fits = lastUser === -1 ? Math.max(0, messages.length - 1) : lastUser;
  }
  // Open the tail at a turn boundary: the nearest user message at or after
  // the byte cut. None at all means the fit index itself is the boundary.
  for (let i = fits; i < messages.length; i++) {
    if (messages[i]?.role === "user") return i;
  }
  return fits;
}

/**
 * Move the messages before the tail into the next segment file and rewrite
 * `conv` in place (the caller persists it). Returns whether anything moved.
 * Segment first, live file second: a crash in between leaves a duplicate the
 * next rotation overwrites (same segment number), never a hole.
 */
export function archiveOlderMessages(
  dir: string,
  conv: StoredConversation,
  tailBytes: number = ARCHIVE_TAIL_BYTES,
): boolean {
  const cut = tailCutIndex(conv.messages, tailBytes);
  if (cut <= 0) return false;
  const prior = conv.archived ?? { messages: 0, segments: [] };
  const n = prior.segments.length + 1;
  const moved = conv.messages.slice(0, cut);
  const file = segmentFileFor(dir, conv.id, n);
  mkdirSync(archiveDirFor(dir, conv.id), { recursive: true });
  const body: SegmentFile = { id: conv.id, segment: n, messages: moved };
  writeFileSync(`${file}.tmp`, JSON.stringify(body));
  renameSync(`${file}.tmp`, file);
  segments.delete(file);
  conv.messages = conv.messages.slice(cut);
  conv.archived = {
    messages: prior.messages + moved.length,
    segments: [...prior.segments, moved.length],
  };
  return true;
}

/** Segments are immutable, so a parsed one is valid until it is deleted. */
export const segments = new LruCache<string, ChatMessage[]>({ capacity: 8 });

export function readSegment(dir: string, id: string, n: number): ChatMessage[] {
  const file = segmentFileFor(dir, id, n);
  const hit = segments.get(file);
  if (hit) return hit;
  let messages: ChatMessage[];
  try {
    messages = (JSON.parse(readFileSync(file, "utf8")) as SegmentFile).messages;
  } catch (err) {
    // A missing or corrupt segment shows as a gap in old history; the live
    // conversation is unaffected, so log loudly and keep serving.
    console.error(`[conversations] archive segment unreadable: ${file}`, err);
    messages = [];
  }
  segments.set(file, messages);
  return messages;
}

/** Messages [start, end) by ABSOLUTE index across segments and the tail. */
export function sliceTranscript(
  dir: string,
  conv: StoredConversation,
  start: number,
  end: number,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  let offset = 0;
  const sizes = conv.archived?.segments ?? [];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i] ?? 0;
    const lo = Math.max(start, offset);
    const hi = Math.min(end, offset + size);
    if (lo < hi)
      out.push(
        ...readSegment(dir, conv.id, i + 1).slice(lo - offset, hi - offset),
      );
    offset += size;
  }
  const lo = Math.max(start, offset);
  const hi = Math.min(end, offset + conv.messages.length);
  if (lo < hi) out.push(...conv.messages.slice(lo - offset, hi - offset));
  return out;
}

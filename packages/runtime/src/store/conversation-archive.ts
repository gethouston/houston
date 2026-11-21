import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { LruCache } from "../lru";
import {
  type MissingSegment,
  reportMissingSegment,
} from "./conversation-archive-missing";
import type { StoredConversation } from "./conversation-file";

const MiB = 1024 * 1024;

export const ARCHIVE_TRIGGER_BYTES = 8 * MiB;

export const ARCHIVE_TAIL_BYTES = 2 * MiB;

export interface ArchiveIndex {
  messages: number;
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
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    fits = lastUser === -1 ? Math.max(0, messages.length - 1) : lastUser;
  }
  for (let i = fits; i < messages.length; i++) {
    if (messages[i]?.role === "user") return i;
  }
  return fits;
}

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
  const tmp = atomicTempPath(file);
  writeFileSync(tmp, JSON.stringify(body));
  renameSync(tmp, file);
  segments.delete(file);
  conv.messages = conv.messages.slice(cut);
  conv.archived = {
    messages: prior.messages + moved.length,
    segments: [...prior.segments, moved.length],
  };
  return true;
}

export const segments = new LruCache<string, ChatMessage[]>({ capacity: 8 });

export function readSegment(
  dir: string,
  id: string,
  n: number,
  missing: MissingSegment = "report",
): ChatMessage[] {
  const file = segmentFileFor(dir, id, n);
  const hit = segments.get(file);
  if (hit) return hit;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const error = reportMissingSegment(file);
    if (missing === "throw") throw error;
    return [];
  }
  let messages: ChatMessage[];
  try {
    messages = (JSON.parse(raw) as SegmentFile).messages;
  } catch (err) {
    console.error(`[conversations] archive segment unreadable: ${file}`, err);
    messages = [];
  }
  segments.set(file, messages);
  return messages;
}

export function sliceTranscript(
  dir: string,
  conv: StoredConversation,
  start: number,
  end: number,
  missing: MissingSegment = "report",
): ChatMessage[] {
  const out: ChatMessage[] = [];
  let offset = 0;
  const sizes = conv.archived?.segments ?? [];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i] ?? 0;
    const lo = Math.max(start, offset);
    const hi = Math.min(end, offset + size);
    if (lo < hi) {
      const segment = readSegment(dir, conv.id, i + 1, missing);
      out.push(...segment.slice(lo - offset, hi - offset));
    }
    offset += size;
  }
  const lo = Math.max(start, offset);
  const hi = Math.min(end, offset + conv.messages.length);
  if (lo < hi) out.push(...conv.messages.slice(lo - offset, hi - offset));
  return out;
}

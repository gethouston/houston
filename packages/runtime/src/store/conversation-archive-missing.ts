import { LruCache } from "../lru";

/**
 * What a reader does with an archive segment the live file's index names but
 * the disk lacks (conversation-archive.ts).
 *
 * - `report`: read it as empty, a reported hole in old history. Every reader
 *   that only shows or replays the chat: on a host whose disk IS the store
 *   (desktop, a standing pod) a lost segment is gone for good, and failing
 *   the read would fail every turn of that chat forever.
 * - `throw`: refuse. A reader that ships the whole document elsewhere (a
 *   transcript repair replaces the remote copy) must never ship that hole as
 *   the transcript.
 *
 * A pool turn's tree holds none of a chat's segments; its readers fetch the
 * ones they reach first (turn/turn-archive-fetch.ts), and that fetch throws
 * when the store itself lacks one.
 */
export type MissingSegment = "report" | "throw";

export class ArchiveSegmentMissingError extends Error {
  constructor(readonly file: string) {
    super(`archive segment missing: ${file}`);
    this.name = "ArchiveSegmentMissingError";
  }
}

/** Bounded: a pool worker reads a fresh tree (new paths) every turn. */
const reported = new LruCache<string, true>({ capacity: 512 });

/**
 * Report a missing segment once per file, however often the chat is read
 * (console.error is the runtime's Sentry feed). Returns the error to throw.
 */
export function reportMissingSegment(file: string): ArchiveSegmentMissingError {
  const error = new ArchiveSegmentMissingError(file);
  if (!reported.get(file)) {
    reported.set(file, true);
    console.error("[conversations] archive segment missing", error);
  }
  return error;
}

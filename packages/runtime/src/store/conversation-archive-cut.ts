import { rmSync } from "node:fs";
import {
  archiveDirFor,
  readSegment,
  segmentFileFor,
  segments,
  totalMessageCount,
} from "./conversation-archive";
import type { StoredConversation } from "./conversation-file";

/**
 * The destructive side of the archive (conversation-archive.ts): cutting a
 * transcript back into a segment for edit-and-resend, and deleting the
 * segments with their conversation.
 */

/**
 * Edit-and-resend at a turn that lives in a segment: the segment's messages
 * before that turn become the live tail, every segment from there on is
 * deleted, and the index shrinks to what is left. Returns how many messages
 * the cut removed, or null when no segment holds the turn.
 */
export function restoreArchivedTurn(
  dir: string,
  conv: StoredConversation,
  turnId: string,
): number | null {
  const sizes = conv.archived?.segments ?? [];
  for (let k = sizes.length; k >= 1; k--) {
    const messages = readSegment(dir, conv.id, k);
    const at = messages.findIndex((m) => m.turnId === turnId);
    if (at === -1) continue;
    const kept = sizes.slice(0, k - 1);
    const keptCount = kept.reduce((sum, n) => sum + n, 0);
    const removed = totalMessageCount(conv) - keptCount - at;
    for (let n = k; n <= sizes.length; n++) {
      const file = segmentFileFor(dir, conv.id, n);
      rmSync(file, { force: true });
      segments.delete(file);
    }
    conv.messages = messages.slice(0, at);
    if (kept.length) conv.archived = { messages: keptCount, segments: kept };
    else delete conv.archived;
    return removed;
  }
  return null;
}

/**
 * Drop every segment (the conversation is being deleted). The segment cache
 * is small, so it is simply cleared rather than searched by prefix.
 */
export function removeArchive(dir: string, id: string): void {
  segments.clear();
  rmSync(archiveDirFor(dir, id), { recursive: true, force: true });
}

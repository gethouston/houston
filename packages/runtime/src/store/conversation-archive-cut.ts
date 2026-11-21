import { rmSync } from "node:fs";
import {
  archiveDirFor,
  readSegment,
  segmentFileFor,
  segments,
  totalMessageCount,
} from "./conversation-archive";
import type { StoredConversation } from "./conversation-file";

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

export function removeArchive(dir: string, id: string): void {
  segments.clear();
  rmSync(archiveDirFor(dir, id), { recursive: true, force: true });
}

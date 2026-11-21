import type { ArchiveIndex } from "./conversation-archive";
import type { HistoryWindow } from "./conversation-queries";

export function historyBounds(
  total: number,
  window: HistoryWindow,
): { start: number; end: number } {
  const end = Math.min(Math.max(window.before ?? total, 0), total);
  const start =
    window.limit === undefined ? 0 : Math.max(0, end - window.limit);
  return { start, end };
}

export function segmentsInWindow(
  archived: ArchiveIndex | undefined,
  total: number,
  window: HistoryWindow,
): number[] {
  const { start, end } = historyBounds(total, window);
  const out: number[] = [];
  let offset = 0;
  for (const [i, size] of (archived?.segments ?? []).entries()) {
    if (Math.max(start, offset) < Math.min(end, offset + size)) out.push(i + 1);
    offset += size;
  }
  return out;
}

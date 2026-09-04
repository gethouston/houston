import type { DownloadEvent } from "@tauri-apps/plugin-updater";

/** Bytes seen so far of a release download, as the updater reports them. */
export interface DownloadTally {
  total: number;
  received: number;
}

export const EMPTY_DOWNLOAD_TALLY: DownloadTally = { total: 0, received: 0 };

/**
 * Fold one updater download event into the tally and read the percentage
 * to show. `null` means "unknown": the feed sent no content length, so a
 * bar can only pulse. A finished download is 100 regardless of what the
 * chunks added up to (a server that under-reported the length must not
 * leave the bar at 97).
 */
export function applyDownloadEvent(
  tally: DownloadTally,
  event: DownloadEvent,
): { tally: DownloadTally; progress: number | null } {
  if (event.event === "Started") {
    const next = { total: event.data.contentLength ?? 0, received: 0 };
    return { tally: next, progress: null };
  }
  if (event.event === "Progress") {
    const next = {
      ...tally,
      received: tally.received + event.data.chunkLength,
    };
    const progress =
      next.total > 0
        ? Math.min(100, Math.round((next.received / next.total) * 100))
        : null;
    return { tally: next, progress };
  }
  return { tally, progress: 100 };
}

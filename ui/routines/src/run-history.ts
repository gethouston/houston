/**
 * Pure formatting helpers for the run-history list (PRODUCT-1208). Kept out of
 * the component so they are unit-testable without a DOM.
 */

import type { RoutineRun } from "./types";

/** Localized "Aug 7, 9:15 AM" start stamp. Empty string on a bad date. */
export function formatRunStart(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Compact elapsed time for a finished run: "12s", "3m 20s", "1h 04m". Null
 * while the run is still going (no `completed_at`) or on a bad/negative span,
 * so the row simply omits it.
 */
export function formatRunDuration(run: RoutineRun): string | null {
  if (!run.completed_at) return null;
  const ms =
    new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

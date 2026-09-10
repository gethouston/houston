import type { ProviderUsageWindow } from "@houston-ai/engine-client";

/**
 * Render-time settling of ONE rate-limit window on the AI Models hub's
 * Connected strip. The engine already settles a window the provider reports
 * past its own reset (`packages/runtime/src/ai/usage/types.ts`), but a reading
 * AGES on screen: the strip polls every five minutes, keeps the last reading
 * through a failed refetch, and the hub stays mounted while hidden. A 5h window
 * whose reset instant passed since the last successful fetch has rolled over
 * (the next request opens a fresh one at 0%), so the bar must not keep drawing
 * the percentage of a window that no longer exists next to no reset note. Pure
 * so it unit-tests under node:test (app/tests/ai-hub-usage-window.test.ts).
 */
export function settleUsageWindow(
  window: ProviderUsageWindow,
  now: number = Date.now(),
): ProviderUsageWindow {
  if (window.resetsAt === null) return window;
  const resetAt = Date.parse(window.resetsAt);
  if (Number.isNaN(resetAt) || resetAt > now) return window;
  return { ...window, usedPercent: 0, resetsAt: null };
}

/**
 * A localized "3 hours ago" phrase for when the strip's retained reading was
 * fetched, so a reading the poll could not refresh is dated instead of shown
 * as live. Null for a junk instant (the note then omits its age).
 */
export function formatReadingAge(
  fetchedAt: number,
  locale: string,
  now: number = Date.now(),
): string | null {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const minutes = Math.max(1, Math.round((now - fetchedAt) / 60_000));
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

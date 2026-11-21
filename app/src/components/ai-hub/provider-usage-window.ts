import type { ProviderUsageWindow } from "@houston/engine-adapter";

export function settleUsageWindow(
  window: ProviderUsageWindow,
  now: number = Date.now(),
): ProviderUsageWindow {
  if (window.resetsAt === null) return window;
  const resetAt = Date.parse(window.resetsAt);
  if (Number.isNaN(resetAt) || resetAt > now) return window;
  return { ...window, usedPercent: 0, resetsAt: null };
}

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

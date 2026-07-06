/**
 * Localized relative-time formatting for the Organization dashboard (Teams v2),
 * shared by the Activity feed and the Agents grid. Uses the platform
 * `Intl.RelativeTimeFormat` so day/word choice localizes per locale without any
 * per-language strings. `now` is injectable so the unit picking is testable.
 */
export function formatRelativeTime(
  atMs: number,
  locale: string,
  now: number = Date.now(),
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffSec = Math.round((atMs - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month");
  return rtf.format(Math.round(diffSec / 31536000), "year");
}

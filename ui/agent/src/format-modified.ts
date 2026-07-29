/**
 * The Modified column's friendly date, the way a file manager writes one: the
 * closer a file is to now, the fewer words it takes to place it.
 *
 *   today                      -> the caller's "Today" word (i18n lives in app/)
 *   the previous 6 days        -> the weekday name ("Monday")
 *   earlier this calendar year -> short month + day ("Jul 24")
 *   older                      -> short month + day + year ("Jul 24, 2025")
 *
 * Pure and locale-driven (`Intl`), never a hardcoded English month name, and
 * never used for ORDER — sorting keeps reading the raw timestamp.
 */

const MISSING = "—";

/** Midnight-anchored day index, so "yesterday" means the calendar day, not 24h. */
function dayIndex(d: Date): number {
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
}

/**
 * @param mtimeMs  epoch ms the file was last modified (undefined = unknown)
 * @param now      epoch ms "now" — injected so the result is testable
 * @param locale   BCP-47 tag; undefined follows the runtime's own locale
 * @param todayLabel translated word for the current calendar day
 */
export function formatModified(
  mtimeMs: number | undefined,
  now: number,
  locale: string | undefined,
  todayLabel: string,
): string {
  if (!mtimeMs) return MISSING;
  const date = new Date(mtimeMs);
  const today = new Date(now);
  const daysAgo = dayIndex(today) - dayIndex(date);

  if (daysAgo === 0) return todayLabel;
  if (daysAgo >= 1 && daysAgo <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  }
  // A future timestamp (clock skew) is not "recent" — it falls through to the
  // dated forms below, which state the day outright instead of guessing.
  if (date.getFullYear() === today.getFullYear()) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** The whole date and time, spelled out for the cell's hover tooltip. */
export function formatModifiedFull(
  mtimeMs: number | undefined,
  locale: string | undefined,
): string | undefined {
  if (!mtimeMs) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(mtimeMs));
}

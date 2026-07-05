import { interp, type RunHistoryLabels } from "./labels.ts";

/** The calendar day of `d` in the display zone, as a UTC-midnight stamp. */
export function dayStamp(d: Date, timeZone?: string): number {
  // en-CA formats as YYYY-MM-DD regardless of the caller's locale.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return Date.parse(`${day}T00:00:00Z`);
}

/**
 * A run timestamp for the history list: "Today/Yesterday at h:mm" within two
 * calendar days, else "Mon D at h:mm" — all in `timeZone` (the account-wide
 * routines zone; absent → the browser's zone).
 */
export function formatRunTime(
  iso: string,
  labels: RunHistoryLabels,
  locale: string,
  timeZone?: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  // Calendar-day distance in the SAME zone the clock renders in — elapsed-time
  // buckets would let "Today"/"Yesterday" contradict the displayed time (a run
  // late last night labeled Today, a run two calendar days back labeled
  // Yesterday).
  const diffDays = Math.round(
    (dayStamp(now, timeZone) - dayStamp(date, timeZone)) / 86_400_000,
  );

  const time = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  if (diffDays === 0) return interp(labels.today, { time });
  if (diffDays === 1) return interp(labels.yesterday, { time });
  const dateStr = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone,
  });
  return interp(labels.onDate, { date: dateStr, time });
}

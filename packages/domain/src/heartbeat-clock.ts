import type { HeartbeatLast, HeartbeatSettings } from "@houston/protocol";

/**
 * The person's wall clock, for the daily heartbeat. Pure: the caller hands in
 * the instant and the zone. The runtime does not know the user's timezone, so
 * the host computes the local date here and the prompt carries it.
 */
export interface LocalClock {
  /** `YYYY-MM-DD` in the zone. */
  date: string;
  /** `HH:MM`, 24-hour, in the zone. */
  time: string;
  /** The IANA zone the two fields were computed in. */
  timezone: string;
}

/** The host machine's own zone; UTC when the platform names none. */
export function hostTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * The account-wide `timezone` preference (the one the routine scheduler
 * reads), or the host's zone when it is unset or names no real zone. A bad
 * value must not stop the briefing: Intl throws a RangeError on it.
 */
export function resolveTimezone(preference: string | null | undefined): string {
  if (!preference) return hostTimezone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: preference });
    return preference;
  } catch {
    return hostTimezone();
  }
}

/**
 * The local date and time of `now` in `timezone`. Intl does the zone math, so
 * DST transitions are whatever the zone database says, never an offset guess.
 */
export function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    timezone,
  };
}

/**
 * The one due rule: on, at or past the chosen time, and not yet run on this
 * local date. That alone gives "fires at 08:00, or on the first launch after
 * 08:00 the same day", and a missed day is never replayed the next day
 * (yesterday's date is not today's, but the rule only ever asks about today).
 */
export function heartbeatDue(
  settings: HeartbeatSettings,
  last: HeartbeatLast | null,
  clock: LocalClock,
): boolean {
  if (!settings.enabled) return false;
  if (clock.time < settings.time) return false;
  return last?.date !== clock.date;
}

/**
 * Compute the next time a 5-field cron expression will fire, in a given IANA
 * timezone. Walks forward but skips whole hours/days when fields obviously
 * don't match — fast enough that we can call this on every routine row every
 * minute without burning CPU. Avoids a cron-parser dependency.
 *
 * Returns `null` when the schedule never fires within 366 days (typically a
 * malformed cron).
 */
import {
  DEFAULT_NEXT_FIRE_LABELS,
  interp,
  type NextFireLabels,
} from "./labels.ts";

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

function expand(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) {
      throw new Error(`Invalid cron field: ${part}`);
    }
    const isStar = m[1] === "*";
    const start = isStar ? min : Number(m[1]);
    const end = m[2] !== undefined ? Number(m[2]) : isStar ? max : Number(m[1]);
    const step = m[3] !== undefined ? Number(m[3]) : 1;
    if (Number.isNaN(start) || Number.isNaN(end) || step <= 0) {
      throw new Error(`Invalid cron field: ${part}`);
    }
    for (let v = start; v <= end; v += step) {
      if (v >= min && v <= max) out.add(v);
    }
  }
  return out;
}

function parseCron(cron: string): CronFields | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minute: expand(parts[0], 0, 59),
      hour: expand(parts[1], 0, 23),
      dom: expand(parts[2], 1, 31),
      month: expand(parts[3], 1, 12),
      dow: expand(parts[4], 0, 6),
      domStar: parts[2] === "*",
      dowStar: parts[4] === "*",
    };
  } catch {
    return null;
  }
}

interface ZonedParts {
  minute: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, fmt);
    return fmt;
  } catch {
    return null;
  }
}

const DOW_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function partsInZone(epochMs: number, timeZone: string): ZonedParts | null {
  const fmt = getFormatter(timeZone);
  if (!fmt) return null;
  const parts = fmt.formatToParts(new Date(epochMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    minute: Number(get("minute")),
    hour,
    dom: Number(get("day")),
    month: Number(get("month")),
    dow: DOW_MAP[get("weekday")] ?? 0,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HORIZON_DAYS = 366;

function matchDay(fields: CronFields, dom: number, dow: number): boolean {
  // Standard cron: when both DoM and DoW are restricted, EITHER matches.
  if (fields.domStar && fields.dowStar) return true;
  if (fields.domStar) return fields.dow.has(dow);
  if (fields.dowStar) return fields.dom.has(dom);
  return fields.dom.has(dom) || fields.dow.has(dow);
}

/**
 * Next time the cron will fire on or after `from` (defaults to now).
 */
export function nextFire(
  cron: string,
  timeZone: string,
  from: Date = new Date(),
): Date | null {
  const fields = parseCron(cron);
  if (!fields) return null;

  // Round forward to the next whole minute so we don't return "now".
  let cursor = Math.ceil((from.getTime() + 1) / MINUTE) * MINUTE;
  const horizon = cursor + HORIZON_DAYS * DAY;

  // Hard iteration cap so a degenerate cron never spins forever.
  for (let iter = 0; iter < 200_000 && cursor <= horizon; iter++) {
    const p = partsInZone(cursor, timeZone);
    if (!p) return null;

    if (!fields.month.has(p.month)) {
      cursor += DAY;
      continue;
    }
    if (!matchDay(fields, p.dom, p.dow)) {
      // Skip rest of this day. +24h is approximate near DST but the next
      // iteration re-examines parts so we always converge.
      cursor += DAY - p.hour * HOUR - p.minute * MINUTE;
      continue;
    }
    if (!fields.hour.has(p.hour)) {
      cursor += HOUR - p.minute * MINUTE;
      continue;
    }
    if (!fields.minute.has(p.minute)) {
      cursor += MINUTE;
      continue;
    }
    return new Date(cursor);
  }
  return null;
}

/**
 * Format a future `Date` as a relative ("in 2h 14m") + absolute ("today at
 * 9:00 AM") pair, both interpreted in the routine's `timeZone`. The connector
 * words come from `labels`; weekday/month/time formatting comes from `locale`.
 */
export function describeNextFire(
  next: Date,
  timeZone: string,
  now: Date = new Date(),
  labels: NextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
): { relative: string; absolute: string } {
  const diffMs = next.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.round(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let relative: string;
  if (totalSeconds < 60) relative = labels.lessThanMinute;
  else if (days === 0 && hours === 0)
    relative = interp(labels.inMinutes, { m: minutes });
  else if (days === 0)
    relative = interp(labels.inHoursMinutes, { h: hours, m: minutes });
  else if (days < 7)
    relative = interp(labels.inDaysHours, { d: days, h: hours });
  else relative = interp(labels.inDays, { d: days });

  // Absolute: today / tomorrow / weekday — computed in the routine's tz.
  let dayLabel = labels.soon;
  let timeLabel = "";
  try {
    const dayFmt = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const todayParts = dayFmt.formatToParts(now);
    const nextParts = dayFmt.formatToParts(next);
    const samePart = (t: string) =>
      todayParts.find((p) => p.type === t)?.value ===
      nextParts.find((p) => p.type === t)?.value;

    if (samePart("month") && samePart("day")) {
      dayLabel = labels.today;
    } else {
      const tomorrow = new Date(now.getTime() + 86_400_000);
      const tomorrowParts = dayFmt.formatToParts(tomorrow);
      const sameAs = (t: string) =>
        tomorrowParts.find((p) => p.type === t)?.value ===
        nextParts.find((p) => p.type === t)?.value;
      if (sameAs("month") && sameAs("day")) {
        dayLabel = labels.tomorrow;
      } else if (days < 7) {
        dayLabel =
          nextParts.find((p) => p.type === "weekday")?.value?.toLowerCase() ??
          labels.soon;
      } else {
        const monthDay = nextParts.filter(
          (p) => p.type === "month" || p.type === "day" || p.type === "literal",
        );
        dayLabel = monthDay.map((p) => p.value).join("") || labels.soon;
      }
    }

    timeLabel = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(next);
  } catch {
    // fall through with defaults
  }

  const absolute = timeLabel
    ? interp(labels.at, { day: dayLabel, time: timeLabel })
    : dayLabel;
  return { relative, absolute };
}

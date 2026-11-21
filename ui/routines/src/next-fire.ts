import { nextEveryFire } from "./next-fire-interval.ts";
import { isEveryForm } from "./schedule-interval-form.ts";

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
  if (fields.domStar && fields.dowStar) return true;
  if (fields.domStar) return fields.dow.has(dow);
  if (fields.dowStar) return fields.dom.has(dom);
  return fields.dom.has(dom) || fields.dow.has(dow);
}

export function nextFire(
  cron: string,
  timeZone: string,
  from: Date = new Date(),
): Date | null {
  if (isEveryForm(cron)) return nextEveryFire(cron, from);
  const fields = parseCron(cron);
  if (!fields) return null;

  let cursor = Math.ceil((from.getTime() + 1) / MINUTE) * MINUTE;
  const horizon = cursor + HORIZON_DAYS * DAY;

  for (let iter = 0; iter < 200_000 && cursor <= horizon; iter++) {
    const p = partsInZone(cursor, timeZone);
    if (!p) return null;

    if (!fields.month.has(p.month)) {
      cursor += DAY;
      continue;
    }
    if (!matchDay(fields, p.dom, p.dow)) {
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

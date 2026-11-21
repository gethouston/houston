const EPOCH_FORM = /usage limit reached\|(\d{9,13})/i;
const WALL_CLOCK_FORM =
  /resets\s+(?:at\s+)?(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const DAY_MS = 86_400_000;
const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;

export function resetFromText(message: string, nowMs: number): string | null {
  const epoch = EPOCH_FORM.exec(message);
  if (epoch?.[1]) {
    const value = Number(epoch[1]);
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  const m = WALL_CLOCK_FORM.exec(message);
  if (!m?.[3] || !m[5] || !m[6]) return null;
  const hour12 = Number(m[3]);
  const minute = m[4] ? Number(m[4]) : 0;
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const hour = (hour12 % 12) + (m[5].toLowerCase() === "pm" ? 12 : 0);
  const zone = /^(utc|gmt)$/i.test(m[6].trim()) ? "UTC" : m[6].trim();
  const clock = zoneClock(zone);
  if (!clock) return null;
  const today = clock(nowMs);
  if (m[1] && m[2]) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    const day = Number(m[2]);
    if (month < 0 || day < 1 || day > 31) return null;
    let at = instantIn(clock, today.year, month, day, hour, minute);
    if (at < nowMs - 183 * DAY_MS)
      at = instantIn(clock, today.year + 1, month, day, hour, minute);
    return new Date(at).toISOString();
  }
  const sameDay = instantIn(
    clock,
    today.year,
    today.month,
    today.day,
    hour,
    minute,
  );
  const at = sameDay > nowMs ? sameDay : sameDay + DAY_MS;
  return at - nowMs <= SESSION_WINDOW_MS ? new Date(at).toISOString() : null;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zoneClock(zone: string): ((ms: number) => WallClock) | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  } catch {
    return null;
  }
  return (ms) => {
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(
        format.formatToParts(new Date(ms)).find((p) => p.type === type)?.value,
      );
    return {
      year: part("year"),
      month: part("month") - 1,
      day: part("day"),
      hour: part("hour") % 24,
      minute: part("minute"),
    };
  };
}

function instantIn(
  clock: (ms: number) => WallClock,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const wall = Date.UTC(year, month, day, hour, minute);
  const offset = (ms: number) => {
    const c = clock(ms);
    const read = Date.UTC(c.year, c.month, c.day, c.hour, c.minute);
    return read - Math.floor(ms / 60_000) * 60_000;
  };
  const first = wall - offset(wall);
  return wall - offset(first);
}

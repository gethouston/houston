import type { HeartbeatLast, HeartbeatSettings } from "@houston/protocol";

export interface LocalClock {
  date: string;
  time: string;
  timezone: string;
}

export function hostTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function resolveTimezone(preference: string | null | undefined): string {
  if (!preference || /^[+-]/.test(preference)) return hostTimezone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: preference });
    return preference;
  } catch {
    return hostTimezone();
  }
}

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

export function heartbeatDue(
  settings: HeartbeatSettings,
  last: HeartbeatLast | null,
  clock: LocalClock,
): boolean {
  if (!settings.enabled) return false;
  if (clock.time < settings.time) return false;
  return last?.date !== clock.date;
}

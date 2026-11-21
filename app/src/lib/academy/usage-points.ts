import type { AnalyticsEventName } from "../analytics-vocabulary";
import { type AcademyRecord, createAcademyRecord } from "./academy-record.ts";

export const USAGE_DAILY_CAP = 20;

export const USAGE_POINT_EVENTS: Partial<Record<AnalyticsEventName, number>> = {
  mission_created: 1,
  chat_message_sent: 1,
  skill_used: 2,
  integration_connected: 2,
  routine_scheduled: 2,
  agent_created: 2,
};

export function usagePointsFor(event: AnalyticsEventName): number {
  return USAGE_POINT_EVENTS[event] ?? 0;
}

export function usageDayStamp(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isDayAfter(previous: string, day: string): boolean {
  const from = Date.parse(`${previous}T00:00:00.000Z`);
  const to = Date.parse(`${day}T00:00:00.000Z`);
  return to - from === 24 * 60 * 60 * 1000;
}

function extendStreak(
  streak: AcademyRecord["streak"],
  day: string,
): AcademyRecord["streak"] {
  const last = streak.lastActiveDay;
  if (last !== null && last >= day) return streak;
  const current =
    last !== null && isDayAfter(last, day) ? streak.current + 1 : 1;
  return {
    current,
    best: Math.max(streak.best, current),
    lastActiveDay: day,
  };
}

export function accrueUsage(
  record: AcademyRecord | null,
  points: number,
  now: Date,
  deviceId: string,
): AcademyRecord | null {
  if (!deviceId.trim())
    throw new RangeError("academy device id must not be empty");
  const wanted = Number.isFinite(points) ? Math.floor(points) : 0;
  if (wanted <= 0) return record;
  const day = usageDayStamp(now);
  const base = record ?? createAcademyRecord(now);
  if (base.usageDay !== null && day < base.usageDay) return record;
  const usedToday = base.usageDay === day ? base.usageToday : 0;
  const awarded = Math.min(wanted, USAGE_DAILY_CAP - usedToday);
  if (awarded <= 0) return record;
  return {
    ...base,
    usageByDevice: {
      ...base.usageByDevice,
      [deviceId]: (base.usageByDevice[deviceId] ?? 0) + awarded,
    },
    usageDay: day,
    usageToday: usedToday + awarded,
    streak: extendStreak(base.streak, day),
    updatedAt: now.toISOString(),
  };
}

export function liveStreak(
  record: AcademyRecord | null,
  today: Date,
): { current: number; best: number } {
  const streak = record?.streak;
  if (!streak) return { current: 0, best: 0 };
  const day = usageDayStamp(today);
  const last = streak.lastActiveDay;
  const alive = last !== null && (last >= day || isDayAfter(last, day));
  return { current: alive ? streak.current : 0, best: streak.best };
}

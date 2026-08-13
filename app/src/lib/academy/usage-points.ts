// The USAGE currency: what actually flying Houston is worth, capped per day.
//
// Experience is earned by learning; usage points are earned by doing, which is
// why the top ranks cannot be read into existence. The cap is the whole design:
// it makes the ladder a habit rather than an afternoon of clicking, and it is
// what the streak rewards. Pure module — `now` is always injected, so a day
// boundary is a test case rather than a thing you wait for.

import type { AnalyticsEventName } from "../analytics";
import { type AcademyRecord, createAcademyRecord } from "./academy-record.ts";

/** Points a single day can pay out, however much the user does. */
export const USAGE_DAILY_CAP = 20;

/**
 * v1 rates. Everyday moments pay 1; the ones that mean the user taught Houston
 * something durable (a skill, an integration, a routine, an agent) pay 2. Any
 * event NOT listed here is worth nothing — the map is the whole economy, so a
 * new analytics event never silently starts paying.
 */
export const USAGE_POINT_EVENTS: Partial<Record<AnalyticsEventName, number>> = {
  mission_created: 1,
  chat_message_sent: 1,
  skill_used: 2,
  integration_connected: 2,
  routine_scheduled: 2,
  agent_created: 2,
  agent_installed_from_store: 2,
};

export function usagePointsFor(event: AnalyticsEventName): number {
  return USAGE_POINT_EVENTS[event] ?? 0;
}

/** The LOCAL calendar day of a moment, `YYYY-MM-DD`. Local, not UTC: a user's
 *  day ends when their evening does, not at a timezone's convenience. */
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

/**
 * The streak on a day the user was active. Same day changes nothing (the streak
 * counts DAYS, not visits), the next calendar day extends it, and any longer gap
 * starts over at one — today still counts. A `lastActiveDay` in the future (a
 * record merged from a device whose clock or timezone runs ahead) is left alone
 * rather than dragged backwards.
 */
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

/**
 * Pays points for something the user just did, rolling the day and the streak.
 * Points are credited to `deviceId` — the install that earned them — so two
 * devices earning at once both keep what they earned (see the record's
 * `usageByDevice`).
 *
 * Returns the record UNCHANGED (identity, so callers can skip the write) when
 * there is nothing to pay: a worthless event, a day already at its cap, or a
 * clock reading EARLIER than the day already counted. That last one is the
 * whole reason the day only ever rolls forward: a day that merely DIFFERS from
 * the stored one used to clear the tally, so setting yesterday's date, earning
 * a full cap, setting today's and earning another paid twice — and alternating
 * the two paid forever.
 *
 * The accepted cost of forward-only: a device whose local day is AHEAD (one
 * flown east, or simply a second machine in a later timezone) writes that day
 * into the shared record, and a device still on the earlier day accrues
 * nothing until its own calendar catches up. Points already earned are never
 * lost, only paused — which is the right way round, because the alternative is
 * an economy anyone can farm by moving a clock.
 */
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
  // A LATER day resets the tally: yesterday's cap is not today's problem.
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

/**
 * The streak as it is TRUE TODAY, which is not what the record says. A stored
 * streak keeps its number until it is next extended, so a run that ended on
 * Monday would still read "5 days" on Friday and quietly lie to the user. A run
 * is alive only if it reaches today or yesterday — yesterday because the day is
 * not over yet and the user can still keep it. `best` is history and stands.
 */
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

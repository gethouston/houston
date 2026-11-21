import { Cron } from "croner";
import { isIntervalForm, parseIntervalSchedule } from "./schedule-interval";

const SAMPLE_FROM = new Date("2026-01-01T00:00:00Z");
const SAMPLE_FIRES = 128;

export function minFireGapMinutes(schedule: string): number | null {
  if (isIntervalForm(schedule)) {
    return parseIntervalSchedule(schedule)?.stepMinutes ?? null;
  }
  let fires: Date[];
  try {
    fires = new Cron(schedule, { utcOffset: 0 }).nextRuns(
      SAMPLE_FIRES + 1,
      SAMPLE_FROM,
    );
  } catch {
    return null;
  }
  let smallest: number | null = null;
  let previous: Date | undefined;
  for (const fire of fires) {
    if (previous) {
      const gap = (fire.getTime() - previous.getTime()) / 60_000;
      if (smallest === null || gap < smallest) smallest = gap;
    }
    previous = fire;
  }
  return smallest;
}

export function scheduleFloorAllows(
  cron: string,
  floor: number | undefined,
): boolean {
  if (floor === undefined) return true;
  const gap = minFireGapMinutes(cron);
  return gap === null || gap >= floor;
}

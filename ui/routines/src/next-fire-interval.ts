import {
  everyStepMinutes,
  parseEverySchedule,
} from "./schedule-interval-form.ts";

export function nextEveryFire(schedule: string, from: Date): Date | null {
  const interval = parseEverySchedule(schedule);
  if (!interval) return null;
  const step = everyStepMinutes(interval) * 60_000;
  return new Date((Math.floor(from.getTime() / step) + 1) * step);
}

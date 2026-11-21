export type EveryUnit = "minutes" | "hours";

export interface EverySchedule {
  every: number;
  unit: EveryUnit;
}

export const MAX_INTERVAL_MINUTES = 10_080;

const INTERVAL_FORM = /^@every ([1-9]\d{0,4})(m|h)$/;

export function everyStepMinutes({ every, unit }: EverySchedule): number {
  return unit === "hours" ? every * 60 : every;
}

export function isEveryForm(schedule: string): boolean {
  return schedule.trim().startsWith("@every");
}

export function parseEverySchedule(schedule: string): EverySchedule | null {
  const match = schedule.trim().match(INTERVAL_FORM);
  if (!match) return null;
  const interval: EverySchedule = {
    every: Number(match[1]),
    unit: match[2] === "h" ? "hours" : "minutes",
  };
  return everyStepMinutes(interval) > MAX_INTERVAL_MINUTES ? null : interval;
}

export function everySchedule(every: number, unit: EveryUnit): string {
  if (unit === "minutes" && every < 60 && 60 % every === 0) {
    return every === 1 ? "* * * * *" : `*/${every} * * * *`;
  }
  const hours = unit === "hours" ? every : every / 60;
  if (Number.isInteger(hours) && 24 % hours === 0) {
    return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
  }
  return `@every ${every}${unit === "hours" ? "h" : "m"}`;
}

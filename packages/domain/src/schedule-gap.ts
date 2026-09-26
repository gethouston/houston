import { Cron } from "croner";

/** A fixed start keeps the answer identical on every device and every day. */
const SAMPLE_FROM = new Date("2026-01-01T00:00:00Z");
/**
 * Consecutive fires sampled. A cron's gaps come from its minute list (within an
 * hour) or from two adjacent firing hours or days, and a pattern whose tightest
 * gap spans an hour fires only a few times per hour, so 128 fires reach that
 * pair while keeping one evaluation to a few milliseconds.
 */
const SAMPLE_FIRES = 128;

/**
 * The smallest gap, in minutes, between two consecutive fires of `schedule`,
 * however the cron spells its cadence (`*\/5`, `0-59/5`, `0,5,10`, a list that
 * wraps the hour). Evaluated in UTC: the cadence is a property of the pattern,
 * not of the zone it runs in. Null when the pattern is invalid or fires fewer
 * than twice.
 */
export function minFireGapMinutes(schedule: string): number | null {
  let cron: Cron;
  try {
    cron = new Cron(schedule, { timezone: "UTC" });
  } catch {
    return null;
  }
  let previous = cron.nextRun(SAMPLE_FROM);
  let smallest: number | null = null;
  for (let i = 0; previous && i < SAMPLE_FIRES; i += 1) {
    const next = cron.nextRun(previous);
    if (!next) break;
    const gap = (next.getTime() - previous.getTime()) / 60_000;
    if (smallest === null || gap < smallest) smallest = gap;
    previous = next;
  }
  return smallest;
}

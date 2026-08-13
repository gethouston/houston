// Folding two copies of one Academy record into one.
//
// Progress only ever GROWS. The engine preference lives on the user's pod in
// hosted mode and the mirror lives on the device, so both copies are routinely
// behind each other — and a device that has been offline for a week must never
// downgrade what another device earned. Every rule below is chosen so that
// merging is safe in either direction and safe to repeat.

import {
  ACADEMY_RECORD_VERSION,
  type AcademyChapterProgress,
  type AcademyRecord,
  type AcademyStreak,
} from "./academy-record.ts";

function earlier(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function later(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** Day stamps are `YYYY-MM-DD`, so string order IS chronological order. A
 *  record with no day at all is older than any record that has one. */
function laterDay(a: string | null, b: string | null): boolean {
  if (a === null) return false;
  return b === null || a > b;
}

function mergeEntry(
  a: AcademyChapterProgress,
  b: AcademyChapterProgress,
): AcademyChapterProgress {
  return {
    completedAt: earlier(a.completedAt, b.completedAt),
    experience: Math.max(a.experience, b.experience),
  };
}

/** Chapters and lessons union; a conflict keeps the earliest completion and the
 *  larger award, so neither copy can take a finished thing away. */
function mergeEntries(
  a: Partial<Record<string, AcademyChapterProgress>>,
  b: Partial<Record<string, AcademyChapterProgress>>,
): Partial<Record<string, AcademyChapterProgress>> {
  const merged: Partial<Record<string, AcademyChapterProgress>> = { ...a };
  for (const [id, entry] of Object.entries(b)) {
    if (!entry) continue;
    const mine = merged[id];
    merged[id] = mine ? mergeEntry(mine, entry) : { ...entry };
  }
  return merged;
}

/**
 * Usage points are counted PER INSTALL, and each install's own count only ever
 * grows, so the larger count of each is the true one. A single total could not
 * do this: two devices that both started at 100 and earned 5 and 7 offline are
 * worth 112, and the larger total alone says 107 — the 5 points the other
 * device earned would simply vanish.
 */
function mergeUsageByDevice(
  a: Partial<Record<string, number>>,
  b: Partial<Record<string, number>>,
): Partial<Record<string, number>> {
  const merged: Partial<Record<string, number>> = { ...a };
  for (const [id, points] of Object.entries(b)) {
    if (points === undefined) continue;
    merged[id] = Math.max(merged[id] ?? 0, points);
  }
  return merged;
}

/**
 * The daily tally travels as a PAIR: a count is meaningless without the day it
 * counts for. The later day wins outright (an older day's tally is spent), and
 * two copies of the same day take the larger count — points earned on one
 * device still push the other device's remaining cap down.
 */
function mergeUsageDay(
  a: AcademyRecord,
  b: AcademyRecord,
): { usageDay: string | null; usageToday: number } {
  if (a.usageDay === b.usageDay)
    return {
      usageDay: a.usageDay,
      usageToday: Math.max(a.usageToday, b.usageToday),
    };
  return laterDay(a.usageDay, b.usageDay)
    ? { usageDay: a.usageDay, usageToday: a.usageToday }
    : { usageDay: b.usageDay, usageToday: b.usageToday };
}

/**
 * `best` is a high-water mark, so it simply takes the maximum. `current` cannot:
 * it is only true ALONGSIDE the day it was last extended, so the pair travels
 * together and the later day wins. A same-day tie takes the larger count — the
 * copy that saw more of the run.
 */
function mergeStreak(a: AcademyStreak, b: AcademyStreak): AcademyStreak {
  const best = Math.max(a.best, b.best);
  if (a.lastActiveDay === b.lastActiveDay)
    return {
      current: Math.max(a.current, b.current),
      best,
      lastActiveDay: a.lastActiveDay,
    };
  const fresh = laterDay(a.lastActiveDay, b.lastActiveDay) ? a : b;
  return { current: fresh.current, best, lastActiveDay: fresh.lastActiveDay };
}

/**
 * Both copies, folded. Only `updatedAt` follows the later copy — it describes
 * the merge, not the truth.
 */
export function mergeAcademyRecords(
  a: AcademyRecord | null,
  b: AcademyRecord | null,
): AcademyRecord | null {
  if (!a) return b;
  if (!b) return a;
  return {
    version: ACADEMY_RECORD_VERSION,
    chapters: mergeEntries(a.chapters, b.chapters),
    lessons: mergeEntries(a.lessons, b.lessons),
    usageByDevice: mergeUsageByDevice(a.usageByDevice, b.usageByDevice),
    ...mergeUsageDay(a, b),
    streak: mergeStreak(a.streak, b.streak),
    updatedAt: later(a.updatedAt, b.updatedAt),
  };
}

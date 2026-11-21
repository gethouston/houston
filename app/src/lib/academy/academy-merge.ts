import {
  ACADEMY_RECORD_VERSION,
  type AcademyChapterProgress,
  type AcademyRecord,
  type AcademyStreak,
} from "./academy-record.ts";
import { mergeLessonPositions } from "./lesson-position.ts";

function earlier(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function later(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

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

export function mergeAcademyRecords(
  a: AcademyRecord | null,
  b: AcademyRecord | null,
): AcademyRecord | null {
  if (!a) return b;
  if (!b) return a;
  const lessons = mergeEntries(a.lessons, b.lessons);
  return {
    version: ACADEMY_RECORD_VERSION,
    chapters: mergeEntries(a.chapters, b.chapters),
    lessons,
    lessonPositions: mergeLessonPositions(
      a.lessonPositions,
      b.lessonPositions,
      lessons,
    ),
    usageByDevice: mergeUsageByDevice(a.usageByDevice, b.usageByDevice),
    ...mergeUsageDay(a, b),
    streak: mergeStreak(a.streak, b.streak),
    updatedAt: later(a.updatedAt, b.updatedAt),
  };
}

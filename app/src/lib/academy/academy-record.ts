// The Academy's persisted progress: which chapters and lessons a user finished,
// the experience each one awarded, and the usage economy (points, today's tally,
// the daily streak) that gates the top ranks.
//
// Pure module — no storage, no React. `./academy-store.ts` decides WHERE the
// record lives, `./academy-record-parse.ts` decides whether a stored blob is one
// of ours, and `./academy-merge.ts` decides how two copies become one.

export const ACADEMY_PREF_KEY = "houston_academy_progress";
export const ACADEMY_RECORD_VERSION = 1;

/** The device a record's points are credited to when they were earned before
 *  per-device counters existed. It merges like any other install. */
export const LEGACY_DEVICE_ID = "legacy";

/** One finished chapter (or lesson): when it was cleared, and what it paid. */
export interface AcademyChapterProgress {
  completedAt: string;
  experience: number;
}

/**
 * The daily-use streak. `lastActiveDay` is a LOCAL calendar day (YYYY-MM-DD),
 * not a timestamp: a streak is about days lived, so it must not shift when the
 * user flies east. `best` is a high-water mark and only ever grows.
 */
export interface AcademyStreak {
  current: number;
  best: number;
  lastActiveDay: string | null;
}

export interface AcademyRecord {
  version: 1;
  /** Chapters awarded whole (the first-run setup chapter). Read and counted so
   *  the experience they hold keeps paying; no path in the app awards one. */
  chapters: Partial<Record<string, AcademyChapterProgress>>;
  /** Lessons pay into the same experience pool as chapters. */
  lessons: Partial<Record<string, AcademyChapterProgress>>;
  /**
   * Where each started-but-unfinished lesson stands: the 0-based beat to
   * resume on. A finished lesson has no entry (`./lesson-position.ts`).
   */
  lessonPositions: Partial<Record<string, number>>;
  /**
   * Usage points, kept PER DEVICE rather than as one total. Two devices that
   * earn on the same day are both right, and one total can only keep one of
   * them: merging would have to choose, and either choice throws away points
   * somebody earned. Per-device counters merge by taking the larger count of
   * each key, so the sum grows by both.
   *
   * The key is minted on the machine itself (`./usage-device.ts`), never taken
   * from anything the ACCOUNT carries: the engine's preference store is one
   * pod per user in hosted mode, so a key read from there would be identical
   * on every device the user owns and collapse these counters into one.
   */
  usageByDevice: Partial<Record<string, number>>;
  /** The local day `usageToday` counts for; null before the first point. */
  usageDay: string | null;
  /**
   * Points earned on `usageDay` — what the daily cap is measured against.
   * Deliberately a per-RECORD fact, not a per-device one: two devices that
   * sync share the day's cap (the merge keeps the larger tally), and two that
   * never meet each spend one. The alternative — a cap per install per day —
   * would pay a second allowance for opening a second device.
   */
  usageToday: number;
  streak: AcademyStreak;
  updatedAt: string;
}

/** Points are counted, never negative, and never `NaN`/`Infinity` — anything
 *  else would poison every sum, rank and comparison downstream. */
export function isPointCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Every usage point on the record, whichever install earned it. Derived, never
 * stored: one number kept beside the per-install counters is one number that
 * can drift away from them.
 */
export function totalUsagePoints(record: AcademyRecord | null): number {
  if (!record) return 0;
  let total = 0;
  for (const points of Object.values(record.usageByDevice)) {
    if (points) total += points;
  }
  return total;
}

/**
 * The stored blob carries a `usagePoints` TOTAL beside the per-install
 * counters. Nothing here reads it back ({@link totalUsagePoints} is the only
 * answer) — it is written for builds that predate `usageByDevice`, whose
 * parser refuses a record without it. Dropping it would cost a user their
 * whole Academy the first time they opened an older build.
 */
export function serializeAcademyRecord(record: AcademyRecord): string {
  return JSON.stringify({ ...record, usagePoints: totalUsagePoints(record) });
}

export function createAcademyRecord(now: Date): AcademyRecord {
  return {
    version: ACADEMY_RECORD_VERSION,
    chapters: {},
    lessons: {},
    lessonPositions: {},
    usageByDevice: {},
    usageDay: null,
    usageToday: 0,
    streak: { current: 0, best: 0, lastActiveDay: null },
    updatedAt: now.toISOString(),
  };
}

function sumEntries(
  entries: Partial<Record<string, AcademyChapterProgress>>,
): number {
  let total = 0;
  for (const entry of Object.values(entries)) {
    if (entry) total += entry.experience;
  }
  return total;
}

/** Everything the user LEARNED, in one number: chapters and lessons pay into
 *  the same pool, so the rank ladder never has to know which is which. */
export function totalExperience(record: AcademyRecord | null): number {
  if (!record) return 0;
  return sumEntries(record.chapters) + sumEntries(record.lessons);
}

/**
 * Awards a lesson ONCE. A lesson already in the record is left exactly as it
 * was: completion is a fact with a date, not a counter, so replaying the
 * finish path (a retried beat, a second window) can never pay twice or move
 * the moment it happened. Clears the lesson's resume position in the same
 * write.
 */
export function completeLessonRecord(
  record: AcademyRecord | null,
  lessonId: string,
  experience: number,
  now: Date,
): AcademyRecord {
  if (!lessonId.trim()) throw new RangeError("academy id must not be empty");
  if (!isPointCount(experience))
    throw new RangeError("academy experience must be a non-negative number");
  const base = record ?? createAcademyRecord(now);
  if (base.lessons[lessonId]) return base;
  const completedAt = now.toISOString();
  return {
    ...base,
    lessons: { ...base.lessons, [lessonId]: { completedAt, experience } },
    // Finishing ends the run, so the place to resume it goes with it.
    lessonPositions: Object.fromEntries(
      Object.entries(base.lessonPositions).filter(
        ([lesson]) => lesson !== lessonId,
      ),
    ),
    updatedAt: completedAt,
  };
}

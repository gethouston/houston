export const ACADEMY_PREF_KEY = "houston_academy_progress";
export const ACADEMY_RECORD_VERSION = 1;

export const LEGACY_DEVICE_ID = "legacy";

export interface AcademyChapterProgress {
  completedAt: string;
  experience: number;
}

export interface AcademyStreak {
  current: number;
  best: number;
  lastActiveDay: string | null;
}

export interface AcademyRecord {
  version: 1;
  chapters: Partial<Record<string, AcademyChapterProgress>>;
  lessons: Partial<Record<string, AcademyChapterProgress>>;
  lessonPositions: Partial<Record<string, number>>;
  usageByDevice: Partial<Record<string, number>>;
  usageDay: string | null;
  usageToday: number;
  streak: AcademyStreak;
  updatedAt: string;
}

export function isPointCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function totalUsagePoints(record: AcademyRecord | null): number {
  if (!record) return 0;
  let total = 0;
  for (const points of Object.values(record.usageByDevice)) {
    if (points) total += points;
  }
  return total;
}

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

export function totalExperience(record: AcademyRecord | null): number {
  if (!record) return 0;
  return sumEntries(record.chapters) + sumEntries(record.lessons);
}

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
    lessonPositions: Object.fromEntries(
      Object.entries(base.lessonPositions).filter(
        ([lesson]) => lesson !== lessonId,
      ),
    ),
    updatedAt: completedAt,
  };
}

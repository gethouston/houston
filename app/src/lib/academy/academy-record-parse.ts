import {
  ACADEMY_RECORD_VERSION,
  type AcademyChapterProgress,
  type AcademyRecord,
  type AcademyStreak,
  isPointCount,
  LEGACY_DEVICE_ID,
} from "./academy-record.ts";
import { parseLessonPositions } from "./lesson-position.ts";

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isDayStamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isChapterProgress(value: unknown): value is AcademyChapterProgress {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<AcademyChapterProgress>;
  return isIsoTimestamp(entry.completedAt) && isPointCount(entry.experience);
}

function parseEntries(
  value: unknown,
): Partial<Record<string, AcademyChapterProgress>> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries: Partial<Record<string, AcademyChapterProgress>> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!id.trim() || !isChapterProgress(entry)) return null;
    entries[id] = {
      completedAt: entry.completedAt,
      experience: entry.experience,
    };
  }
  return entries;
}

function parseUsageByDevice(
  byDevice: unknown,
  total: unknown,
): Partial<Record<string, number>> | null {
  if (byDevice === undefined) {
    if (total === undefined) return {};
    if (!isPointCount(total)) return null;
    return total > 0 ? { [LEGACY_DEVICE_ID]: total } : {};
  }
  if (!byDevice || typeof byDevice !== "object" || Array.isArray(byDevice))
    return null;
  const counters: Partial<Record<string, number>> = {};
  for (const [id, points] of Object.entries(byDevice)) {
    if (!id.trim() || !isPointCount(points)) return null;
    counters[id] = points;
  }
  return counters;
}

function parseStreak(value: unknown): AcademyStreak | null {
  if (value === undefined) return { current: 0, best: 0, lastActiveDay: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const streak = value as Partial<AcademyStreak>;
  if (!isPointCount(streak.current) || !isPointCount(streak.best)) return null;
  const lastActiveDay = streak.lastActiveDay ?? null;
  if (lastActiveDay !== null && !isDayStamp(lastActiveDay)) return null;
  return { current: streak.current, best: streak.best, lastActiveDay };
}

export function parseAcademyRecord(raw: string | null): AcademyRecord | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<AcademyRecord>;
  if (record.version !== ACADEMY_RECORD_VERSION) return null;
  const chapters =
    record.chapters === undefined ? null : parseEntries(record.chapters);
  const lessons = parseEntries(record.lessons);
  const streak = parseStreak(record.streak);
  const usageByDevice = parseUsageByDevice(
    record.usageByDevice,
    (parsed as { usagePoints?: unknown }).usagePoints,
  );
  if (!chapters || !lessons || !streak || !usageByDevice) return null;
  if (!isIsoTimestamp(record.updatedAt)) return null;
  const usageDay = record.usageDay ?? null;
  if (usageDay !== null && !isDayStamp(usageDay)) return null;
  const usageToday = record.usageToday ?? 0;
  if (!isPointCount(usageToday)) return null;
  return {
    version: ACADEMY_RECORD_VERSION,
    chapters,
    lessons,
    lessonPositions: parseLessonPositions(record.lessonPositions),
    usageByDevice,
    usageDay,
    usageToday,
    streak,
    updatedAt: record.updatedAt,
  };
}

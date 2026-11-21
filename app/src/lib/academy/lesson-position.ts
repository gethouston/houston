import { academyLesson } from "../../components/academy/lessons/registry.ts";
import { type AcademyRecord, createAcademyRecord } from "./academy-record.ts";
import { type LessonSpec, lessonResumeOn } from "./lesson-spec.ts";

export type LessonPositions = Partial<Record<string, number>>;

export function isLessonPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseLessonPositions(value: unknown): LessonPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const positions: LessonPositions = {};
  for (const [id, index] of Object.entries(value)) {
    if (id.trim() && isLessonPosition(index)) positions[id] = index;
  }
  return positions;
}

function withinLesson(lessonId: string, index: number): boolean {
  const lesson = academyLesson(lessonId);
  return lesson === undefined || index < lesson.steps.length;
}

export function mergeLessonPositions(
  a: LessonPositions,
  b: LessonPositions,
  finished: AcademyRecord["lessons"],
): LessonPositions {
  const merged: LessonPositions = {};
  for (const source of [a, b]) {
    for (const [id, index] of Object.entries(source)) {
      if (index === undefined || finished[id] || !withinLesson(id, index))
        continue;
      merged[id] = Math.max(merged[id] ?? 0, index);
    }
  }
  return merged;
}

export function recordLessonPosition(
  record: AcademyRecord | null,
  lessonId: string,
  index: number,
  now: Date,
): AcademyRecord | null {
  if (!lessonId.trim()) throw new RangeError("academy id must not be empty");
  if (!isLessonPosition(index) || !withinLesson(lessonId, index))
    throw new RangeError("lesson position must be a beat of the lesson");
  if (record?.lessons[lessonId]) return record;
  if (record?.lessonPositions[lessonId] === index) return record;
  const base = record ?? createAcademyRecord(now);
  return {
    ...base,
    lessonPositions: { ...base.lessonPositions, [lessonId]: index },
    updatedAt: now.toISOString(),
  };
}

export function lessonStartIndex(
  record: AcademyRecord | null,
  lesson: LessonSpec,
): number {
  if (!record || record.lessons[lesson.id]) return 0;
  const stored = record.lessonPositions[lesson.id];
  if (stored === undefined || stored >= lesson.steps.length) return 0;
  const resumeOn = lessonResumeOn(lesson.steps[stored]);
  if (resumeOn === undefined) return stored;
  const earlier = lesson.steps.findIndex((beat) => beat.id === resumeOn);
  return earlier >= 0 && earlier < stored ? earlier : stored;
}

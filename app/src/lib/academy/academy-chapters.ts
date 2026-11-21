import type { AcademyRecord } from "./academy-record.ts";

export const ACADEMY_CHAPTER_IDS = ["getting-started"] as const;

export type AcademyChapterId = (typeof ACADEMY_CHAPTER_IDS)[number];

export const GETTING_STARTED_CHAPTER_ID: AcademyChapterId = "getting-started";

export function chapterFinishedIn(
  record: AcademyRecord | null,
  lessonIds: readonly string[],
): boolean {
  return (
    lessonIds.length > 0 &&
    lessonIds.every((id) => record?.lessons[id] !== undefined)
  );
}

export function writeFinishedChapter(
  before: AcademyRecord | null,
  after: AcademyRecord | null,
  lessonIds: readonly string[],
): boolean {
  return (
    !chapterFinishedIn(before, lessonIds) && chapterFinishedIn(after, lessonIds)
  );
}

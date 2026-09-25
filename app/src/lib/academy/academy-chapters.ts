import type { AcademyRecord } from "./academy-record.ts";

/**
 * The chapters of the Academy path, in the order they are walked.
 *
 * A chapter is a heading and nothing more: the lessons it holds are whichever
 * registry lessons name it as their `chapterId`
 * (`components/academy/lessons/registry.ts`), in registry order, and it is
 * finished when every one of them is. So a new lesson is a registry entry plus
 * its copy, and a new chapter is an id here plus
 * `chapters.<id>.title` in every `locales/<lang>/academy.json`.
 */
export const ACADEMY_CHAPTER_IDS = ["getting-started"] as const;

export type AcademyChapterId = (typeof ACADEMY_CHAPTER_IDS)[number];

/** The first chapter: finding your way around Houston. */
export const GETTING_STARTED_CHAPTER_ID: AcademyChapterId = "getting-started";

/** Every one of a chapter's lessons is finished in this record. A chapter
 *  with no lessons never is. */
export function chapterFinishedIn(
  record: AcademyRecord | null,
  lessonIds: readonly string[],
): boolean {
  return (
    lessonIds.length > 0 &&
    lessonIds.every((id) => record?.lessons[id] !== undefined)
  );
}

/**
 * Whether one write finished the chapter: unfinished in the record it was
 * applied to, finished in the one it produced. A replay of a lesson in a
 * chapter already finished is therefore never a second completion.
 */
export function writeFinishedChapter(
  before: AcademyRecord | null,
  after: AcademyRecord | null,
  lessonIds: readonly string[],
): boolean {
  return (
    !chapterFinishedIn(before, lessonIds) && chapterFinishedIn(after, lessonIds)
  );
}

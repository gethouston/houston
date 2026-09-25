import {
  ACADEMY_CHAPTER_IDS,
  type AcademyChapterId,
} from "../../lib/academy/academy-chapters.ts";
import type { AcademyRecord } from "../../lib/academy/academy-record.ts";
import { lessonStartIndex } from "../../lib/academy/lesson-position.ts";
import type { LessonSpec } from "../../lib/academy/lesson-spec.ts";
import { ACADEMY_LESSONS } from "./lessons/registry.ts";

/**
 * What the Academy path shows, read from the stored record: each chapter, the
 * lessons in it, and where the user stands in each.
 *
 * Pure and stated once, because the path and the runner must agree about a
 * lesson: the path offering "Continue" on a lesson the runner then opens on its
 * first beat would tell the user two stories (`lessonStartIndex` is the rule
 * both read). Tested in `app/tests/academy-path-state.test.ts`.
 */

/** Where the user stands in one lesson. */
export type LessonPathState =
  | { kind: "new" }
  /** Started, not finished: resumes on `resumeIndex` (0-based). */
  | { kind: "started"; resumeIndex: number }
  | { kind: "finished"; experience: number };

/** The one thing the path offers to do about a lesson. */
export type LessonPathAction = "start" | "continue" | "replay";

export interface LessonPathEntry {
  lesson: LessonSpec;
  state: LessonPathState;
}

export interface ChapterPath {
  id: AcademyChapterId;
  lessons: LessonPathEntry[];
  finishedCount: number;
  /** Every lesson in it finished. A chapter with no lessons never is. */
  finished: boolean;
}

export function lessonPathState(
  record: AcademyRecord | null,
  lesson: LessonSpec,
): LessonPathState {
  const done = record?.lessons[lesson.id];
  if (done) return { kind: "finished", experience: done.experience };
  if (record?.lessonPositions[lesson.id] === undefined) return { kind: "new" };
  // Resumes wherever the runner will open it. A stale position opens on the
  // first beat there, and the lesson is still one the user began.
  return {
    kind: "started",
    resumeIndex: lessonStartIndex(record, lesson),
  };
}

export function lessonPathAction(state: LessonPathState): LessonPathAction {
  switch (state.kind) {
    case "new":
      return "start";
    case "started":
      return "continue";
    case "finished":
      return "replay";
  }
}

/**
 * Every chapter in walking order, each with its lessons in registry order.
 * `lessons` is injectable so the rule is tested against lessons of the test's
 * own making rather than whatever the registry ships this week.
 */
export function academyChapterPaths(
  record: AcademyRecord | null,
  lessons: readonly LessonSpec[] = Object.values(ACADEMY_LESSONS),
): ChapterPath[] {
  return ACADEMY_CHAPTER_IDS.map((id) => {
    const entries = lessons
      .filter((lesson) => lesson.chapterId === id)
      .map((lesson) => ({ lesson, state: lessonPathState(record, lesson) }));
    const finishedCount = entries.filter(
      (entry) => entry.state.kind === "finished",
    ).length;
    return {
      id,
      lessons: entries,
      finishedCount,
      finished: entries.length > 0 && finishedCount === entries.length,
    };
  });
}

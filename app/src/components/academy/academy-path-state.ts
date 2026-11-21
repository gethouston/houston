import {
  ACADEMY_CHAPTER_IDS,
  type AcademyChapterId,
} from "../../lib/academy/academy-chapters.ts";
import type { AcademyRecord } from "../../lib/academy/academy-record.ts";
import { lessonStartIndex } from "../../lib/academy/lesson-position.ts";
import type { LessonSpec } from "../../lib/academy/lesson-spec.ts";
import { ACADEMY_LESSONS } from "./lessons/registry.ts";

export type LessonPathState =
  | { kind: "new" }
  | { kind: "started"; resumeIndex: number }
  | { kind: "finished"; experience: number };

export type LessonPathAction = "start" | "continue" | "replay";

export interface LessonPathEntry {
  lesson: LessonSpec;
  state: LessonPathState;
}

export interface ChapterPath {
  id: AcademyChapterId;
  lessons: LessonPathEntry[];
  finishedCount: number;
  finished: boolean;
}

export function lessonPathState(
  record: AcademyRecord | null,
  lesson: LessonSpec,
): LessonPathState {
  const done = record?.lessons[lesson.id];
  if (done) return { kind: "finished", experience: done.experience };
  if (record?.lessonPositions[lesson.id] === undefined) return { kind: "new" };
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

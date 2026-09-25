import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  academyChapterPaths,
  lessonPathAction,
  lessonPathState,
} from "../src/components/academy/academy-path-state.ts";
import { ACADEMY_CHAPTER_IDS } from "../src/lib/academy/academy-chapters.ts";
import type { AcademyRecord } from "../src/lib/academy/academy-record.ts";
import type { LessonSpec } from "../src/lib/academy/lesson-spec.ts";

// What the path offers for each lesson, and when a chapter is done. The runner
// opens a lesson on `lessonStartIndex`; the path must say the same thing.

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {},
  lessons: {},
  lessonPositions: {},
  usageByDevice: {},
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

const lesson = (id: string, beats = 3): LessonSpec => ({
  id,
  chapterId: "getting-started",
  experience: 20,
  steps: Array.from({ length: beats }, (_, i) => ({
    kind: "card" as const,
    id: `beat-${i}`,
  })),
});

const FINISHED = { completedAt: "2026-08-02T10:00:00.000Z", experience: 20 };

describe("a lesson on the path", () => {
  it("offers Start on a lesson never begun", () => {
    const state = lessonPathState(null, lesson("tour"));
    deepStrictEqual(state, { kind: "new" });
    strictEqual(lessonPathAction(state), "start");
  });

  it("offers Continue on a lesson begun and left, with the beat it resumes on", () => {
    const paused = record({ lessonPositions: { tour: 1 } });
    const state = lessonPathState(paused, lesson("tour"));
    deepStrictEqual(state, { kind: "started", resumeIndex: 1 });
    strictEqual(lessonPathAction(state), "continue");
  });

  it("still offers Continue, from the first beat, when the kept beat is gone", () => {
    const paused = record({ lessonPositions: { tour: 7 } });
    deepStrictEqual(lessonPathState(paused, lesson("tour")), {
      kind: "started",
      resumeIndex: 0,
    });
  });

  it("offers Replay on a finished lesson, whatever position lingers", () => {
    const done = record({
      lessons: { tour: FINISHED },
      lessonPositions: { tour: 1 },
    });
    const state = lessonPathState(done, lesson("tour"));
    deepStrictEqual(state, { kind: "finished", experience: 20 });
    strictEqual(lessonPathAction(state), "replay");
  });
});

describe("academyChapterPaths", () => {
  const lessons = [lesson("tour"), lesson("email")];

  it("lists every chapter in walking order, its lessons in registry order", () => {
    const paths = academyChapterPaths(null, lessons);
    deepStrictEqual(
      paths.map((chapter) => chapter.id),
      [...ACADEMY_CHAPTER_IDS],
    );
    deepStrictEqual(
      paths[0].lessons.map((entry) => entry.lesson.id),
      ["tour", "email"],
    );
  });

  it("finishes a chapter only when every lesson in it is finished", () => {
    const one = record({ lessons: { tour: FINISHED } });
    const [partial] = academyChapterPaths(one, lessons);
    strictEqual(partial.finishedCount, 1);
    strictEqual(partial.finished, false);

    const both = record({ lessons: { tour: FINISHED, email: FINISHED } });
    const [done] = academyChapterPaths(both, lessons);
    strictEqual(done.finishedCount, 2);
    strictEqual(done.finished, true);
  });

  it("never calls a chapter with no lessons finished", () => {
    const [empty] = academyChapterPaths(record(), []);
    strictEqual(empty.lessons.length, 0);
    strictEqual(empty.finished, false);
  });
});

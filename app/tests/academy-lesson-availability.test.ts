import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  availableLessons,
  lessonAvailable,
} from "../src/components/academy/lessons/lesson-availability.ts";
import {
  ACADEMY_LESSONS,
  chapterLessonIds,
  EMPLOYEE_EMAIL_LESSON_ID,
  HOUSTON_TOUR_LESSON_ID,
} from "../src/components/academy/lessons/registry.ts";
import {
  GETTING_STARTED_CHAPTER_ID,
  writeFinishedChapter,
} from "../src/lib/academy/academy-chapters.ts";

// A lesson the deployment cannot teach is not offered: the email lesson's
// connect beat can only end on a connected email app.

const email = ACADEMY_LESSONS[EMPLOYEE_EMAIL_LESSON_ID];
const tour = ACADEMY_LESSONS[HOUSTON_TOUR_LESSON_ID];

describe("lesson availability", () => {
  it("offers the email lesson only where the integrations are served", () => {
    strictEqual(lessonAvailable(email, { integrations: ["composio"] }), true);
    strictEqual(lessonAvailable(email, { integrations: [] }), false);
    strictEqual(lessonAvailable(email, null), false);
  });

  it("offers a lesson with no requirement everywhere", () => {
    strictEqual(lessonAvailable(tour, null), true);
  });

  it("filters the shipped lessons in registry order", () => {
    deepStrictEqual(
      availableLessons(Object.values(ACADEMY_LESSONS), null).map((l) => l.id),
      [HOUSTON_TOUR_LESSON_ID],
    );
  });

  it("closes a chapter on the lessons the path shows", () => {
    // The chapter is finished when every lesson the path shows is: one the
    // path hides must never keep it open.
    deepStrictEqual(chapterLessonIds(GETTING_STARTED_CHAPTER_ID, null), [
      HOUSTON_TOUR_LESSON_ID,
    ]);
    const tourDone = {
      version: 1 as const,
      chapters: {},
      lessons: {
        [HOUSTON_TOUR_LESSON_ID]: {
          completedAt: "2026-08-02T10:00:00.000Z",
          experience: 25,
        },
      },
      lessonPositions: {},
      usageByDevice: {},
      usageDay: null,
      usageToday: 0,
      streak: { current: 0, best: 0, lastActiveDay: null },
      updatedAt: "2026-08-02T10:00:00.000Z",
    };
    strictEqual(
      writeFinishedChapter(
        null,
        tourDone,
        chapterLessonIds(GETTING_STARTED_CHAPTER_ID, null),
      ),
      true,
    );
  });
});

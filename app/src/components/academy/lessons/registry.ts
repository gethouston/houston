import type { LessonSpec } from "../../../lib/academy/lesson-spec.ts";
import { TEAM_VIEW_ID } from "../../../lib/top-level-views.ts";
import { tourSelector } from "../../shell/workspace-tour-steps.ts";

/**
 * Every lesson the app ships, by id. Data only — the runner plays whatever is
 * here, so adding a lesson is adding an entry plus its copy in every
 * `locales/<lang>/academy.json`.
 *
 * ONE lesson today: the canary that proves the engine end to end (video beat,
 * narration beat, a spotlight on a REAL control that ends when the app itself
 * says the taught action happened). It is dormant — no surface arms it, so the
 * only way it plays is `activeLessonId` being set. The path will offer lessons
 * when the chapter model they belong inside is built.
 *
 * A LESSON ID IS ALSO A COPY KEY. Every beat resolves its words under
 * `lessons.<lessonId>.…` in the `academy` namespace, the same node the shared
 * lesson chrome lives in, so the chrome's own keys (`exit`, `progress`,
 * `stepCount`, `video`) are reserved: an id equal to one of them would file a
 * lesson's copy on top of the words every lesson reads. Ids stay lowercase
 * slugs and stay clear of that list, and `academy-lesson-registry.test.ts`
 * holds both halves of the rule against the English locale.
 */

/** The canary lesson: give an agent its first task. */
export const SEND_FIRST_TASK_LESSON_ID = "send-first-task";

/** The chapter the lessons are booked under until chapters grow. */
export const PREVIEW_CHAPTER_ID = "chapter-preview";

export const ACADEMY_LESSONS: Record<string, LessonSpec> = {
  [SEND_FIRST_TASK_LESSON_ID]: {
    id: SEND_FIRST_TASK_LESSON_ID,
    chapterId: PREVIEW_CHAPTER_ID,
    experience: 20,
    steps: [
      // Watch it happen, then do it. The clip never blocks: Continue is
      // available from the first frame (and the beat renders a placeholder
      // while the clip itself is still being made).
      { kind: "video", id: "watch", videoId: SEND_FIRST_TASK_LESSON_ID },
      { kind: "card", id: "intro" },
      {
        kind: "spotlight",
        id: "newTask",
        target: tourSelector("newMission"),
        // The New task button lives on a team's Mission Control, so the beat
        // puts the user on a board before pointing at it. `TEAM_VIEW_ID` is
        // resolved by `navigateToLessonView`, which goes through the ONE
        // writer of a whole team view rather than setting the id alone.
        navigate: { viewId: TEAM_VIEW_ID },
        advanceOn: { type: "conversationCreated" },
      },
    ],
  },
};

/**
 * The lesson with this id, or undefined for an id nothing ships any more.
 * Own-property lookup only, so an id like `toString` resolves to nothing
 * instead of to something off the prototype.
 */
export function academyLesson(lessonId: string): LessonSpec | undefined {
  return Object.hasOwn(ACADEMY_LESSONS, lessonId)
    ? ACADEMY_LESSONS[lessonId]
    : undefined;
}

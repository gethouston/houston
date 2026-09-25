import {
  type AcademyChapterId,
  GETTING_STARTED_CHAPTER_ID,
} from "../../../lib/academy/academy-chapters.ts";
import { EMAIL_TOOLKIT_SLUGS } from "../../../lib/academy/email-lesson/email-sender.ts";
import type { LessonSpec } from "../../../lib/academy/lesson-spec.ts";
import { TEAM_VIEW_ID } from "../../../lib/top-level-views.ts";
import {
  composerSendSelector,
  type TourTarget,
  tourSelector,
} from "../../shell/workspace-tour-steps.ts";
import {
  availableLessons,
  type LessonCapabilities,
} from "./lesson-availability.ts";

/**
 * Every lesson the app ships, by id. Data only — the runner plays whatever is
 * here and the Academy path lists it under its `chapterId`
 * (`lib/academy/academy-chapters.ts`), so adding a lesson is adding an entry
 * plus its copy in every `locales/<lang>/academy.json`. Entry order IS the
 * order a chapter lists its lessons in.
 *
 * A beat's `advanceOn` is one of `LessonSignalSpec`
 * (`lib/academy/lesson-signals.ts`); a lesson that needs a new kind of signal
 * adds a member there, its reading in `./use-lesson-signals.ts` and its arming
 * rule in `./lesson-arming.ts`. A beat no single real control can teach is a
 * `panel` (`./lesson-panel.tsx` maps each id to its component).
 *
 * A LESSON ID IS ALSO A COPY KEY. Every beat resolves its words under
 * `lessons.<lessonId>.…` in the `academy` namespace, the same node the shared
 * lesson chrome lives in, so the chrome's own keys (`exit`, `progress`,
 * `stepCount`, `video`) are reserved: an id equal to one of them would file a
 * lesson's copy on top of the words every lesson reads. Ids stay lowercase
 * slugs and stay clear of that list, and `academy-lesson-registry.test.ts`
 * holds both halves of the rule against the English locale.
 */

/** A walk around the app: where each thing lives and what it is for. */
export const HOUSTON_TOUR_LESSON_ID = "houston-tour";
/** An AI Employee does real work: it sends the user an email. */
export const EMPLOYEE_EMAIL_LESSON_ID = "employee-email";

/**
 * A target that exists at both breakpoints: the desktop control first, then
 * the phone's way to it. The spotlight lights the first match that is on
 * screen, and the two never are at once (the rail is not rendered on the
 * phone; the phone's bar is CSS-hidden on the desktop), so one beat reads
 * right on either.
 */
function onEitherScreen(desktop: TourTarget, phone: TourTarget): string {
  return `${tourSelector(desktop)}, ${tourSelector(phone)}`;
}

export const ACADEMY_LESSONS: Record<string, LessonSpec> = {
  [HOUSTON_TOUR_LESSON_ID]: {
    id: HOUSTON_TOUR_LESSON_ID,
    chapterId: GETTING_STARTED_CHAPTER_ID,
    experience: 25,
    // Every stop only has to be seen, so each waits on the user's Next. The
    // four destinations past the board live in the phone's More menu, so the
    // phone lights More for them.
    steps: [
      {
        kind: "spotlight",
        id: "team",
        target: onEitherScreen("agents", "mobileAgentsTab"),
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "board",
        target: tourSelector("main"),
        // A team view is resolved by `navigateToLessonView`, which goes
        // through the ONE writer of a whole team view.
        navigate: { viewId: TEAM_VIEW_ID },
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "newTask",
        target: tourSelector("newMission"),
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "aiModels",
        target: onEitherScreen("nav-ai-hub", "mobileMenu"),
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "integrations",
        target: onEitherScreen("nav-integrations", "mobileMenu"),
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "skills",
        target: onEitherScreen("nav-skills", "mobileMenu"),
        advanceOn: { type: "acknowledged" },
      },
      {
        kind: "spotlight",
        id: "academy",
        target: onEitherScreen("nav-academy", "mobileMenu"),
        advanceOn: { type: "acknowledged" },
      },
    ],
  },
  [EMPLOYEE_EMAIL_LESSON_ID]: {
    id: EMPLOYEE_EMAIL_LESSON_ID,
    chapterId: GETTING_STARTED_CHAPTER_ID,
    // The connect beat only ends on a connected email app.
    requires: ["integrations"],
    experience: 25,
    steps: [
      { kind: "card", id: "intro" },
      // Already connected is already done: the beat passes on arrival.
      {
        kind: "panel",
        id: "connect",
        panel: "emailConnect",
        advanceOn: {
          type: "integrationConnected",
          toolkits: EMAIL_TOOLKIT_SLUGS,
        },
      },
      { kind: "panel", id: "sender", panel: "emailSender" },
      // The real product flow: the picked AI Employee's New task composer
      // opens with the request typed in, and the user presses Send. The
      // companion ends the beat on THAT AI Employee's new task, never on any
      // conversation appearing. Asks from the sender beat's pick, which a
      // restart does not keep.
      {
        kind: "spotlight",
        id: "ask",
        target: composerSendSelector("taskChat"),
        companion: "emailAsk",
        advanceOn: { type: "companion" },
        resumeOn: "sender",
      },
      // The task runs like any other: a failed send is the AI Employee's to
      // explain in the chat. The user's "I got it" finishes the lesson, and so
      // does the conversation showing the email sent.
      {
        kind: "spotlight",
        id: "watch",
        target: tourSelector("taskChat"),
        companion: "emailWatch",
        advanceOn: { type: "acknowledged" },
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

/**
 * The ids of the lessons a chapter holds here, in path order: only the ones
 * this deployment can teach, the same ones the path shows.
 */
export function chapterLessonIds(
  chapterId: AcademyChapterId,
  capabilities: LessonCapabilities,
): string[] {
  return availableLessons(Object.values(ACADEMY_LESSONS), capabilities)
    .filter((lesson) => lesson.chapterId === chapterId)
    .map((lesson) => lesson.id);
}

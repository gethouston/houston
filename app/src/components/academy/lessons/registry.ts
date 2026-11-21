import {
  type AcademyChapterId,
  GETTING_STARTED_CHAPTER_ID,
} from "../../../lib/academy/academy-chapters.ts";
import { EMAIL_TOOLKIT_SLUGS } from "../../../lib/academy/email-lesson/email-sender.ts";
import type { LessonSpec } from "../../../lib/academy/lesson-spec.ts";
import { AGENT_VIEW_ID } from "../../../lib/top-level-views.ts";
import {
  composerSendSelector,
  type TourTarget,
  tourSelector,
} from "../../shell/workspace-tour-steps.ts";
import {
  availableLessons,
  type LessonCapabilities,
} from "./lesson-availability.ts";

export const HOUSTON_TOUR_LESSON_ID = "houston-tour";
export const EMPLOYEE_EMAIL_LESSON_ID = "employee-email";

function onEitherScreen(desktop: TourTarget, phone: TourTarget): string {
  return `${tourSelector(desktop)}, ${tourSelector(phone)}`;
}

export const ACADEMY_LESSONS: Record<string, LessonSpec> = {
  [HOUSTON_TOUR_LESSON_ID]: {
    id: HOUSTON_TOUR_LESSON_ID,
    chapterId: GETTING_STARTED_CHAPTER_ID,
    experience: 25,
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
        navigate: { viewId: AGENT_VIEW_ID },
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
        id: "academy",
        target: onEitherScreen("workspaceMenu", "mobileMenu"),
        advanceOn: { type: "acknowledged" },
      },
    ],
  },
  [EMPLOYEE_EMAIL_LESSON_ID]: {
    id: EMPLOYEE_EMAIL_LESSON_ID,
    chapterId: GETTING_STARTED_CHAPTER_ID,
    requires: ["integrations"],
    experience: 25,
    steps: [
      { kind: "card", id: "intro" },
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
      {
        kind: "spotlight",
        id: "ask",
        target: composerSendSelector("taskChat"),
        companion: "emailAsk",
        advanceOn: { type: "companion" },
        resumeOn: "sender",
      },
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

export function academyLesson(lessonId: string): LessonSpec | undefined {
  return Object.hasOwn(ACADEMY_LESSONS, lessonId)
    ? ACADEMY_LESSONS[lessonId]
    : undefined;
}

export function chapterLessonIds(
  chapterId: AcademyChapterId,
  capabilities: LessonCapabilities,
): string[] {
  return availableLessons(Object.values(ACADEMY_LESSONS), capabilities)
    .filter((lesson) => lesson.chapterId === chapterId)
    .map((lesson) => lesson.id);
}

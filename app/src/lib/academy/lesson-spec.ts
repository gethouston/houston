/**
 * What an Academy lesson IS: a list of beats, declared as data.
 *
 * A lesson is content, not code — the runner
 * (`components/academy/lessons/lesson-runner.tsx`) knows how to play any spec
 * and nothing about which lesson is playing, exactly as the tutorial family
 * knows nothing about the setup flow that uses it. Specs stay serializable
 * (plain data, no functions, no React) so a lesson can one day arrive from the
 * server without the runner changing.
 *
 * COPY LIVES IN i18n, NEVER IN A SPEC. Every beat resolves its words from the
 * `academy` namespace under a key built from the ids:
 *
 *     lessons.<lessonId>.title              the lesson's name on the path
 *     lessons.<lessonId>.description        the line under it
 *     lessons.<lessonId>.steps.<stepId>.title
 *     lessons.<lessonId>.steps.<stepId>.body
 *     lessons.<lessonId>.steps.<stepId>.cta
 *
 * Which of the three a beat uses depends on its kind: a `card` needs title,
 * body and cta; a `video` needs a title (body optional); a `spotlight` needs
 * only the one sentence it whispers, its `body`.
 * `academy-lesson-registry.test.ts` pins every key a shipped lesson resolves
 * against `locales/en/academy.json`, so a lesson can never ship with a beat
 * that renders a raw key.
 */

import type { LessonSignalSpec } from "./lesson-signals.ts";

/** One beat of a lesson. */
export type LessonStepSpec =
  /** Watch it happen: the lesson's clip, played by `LessonVideoCard`. */
  | { kind: "video"; id: string; videoId: string }
  /** Narration: a centered card with one button that moves on. */
  | { kind: "card"; id: string }
  /** Do it: the shell dims, the real control lights up, and the beat ends
   *  when the app itself says the taught action happened. */
  | {
      kind: "spotlight";
      id: string;
      /** CSS selector of the control, built with `tourSelector` /
       *  `tutorialSelector` — never a hand-written string, so a renamed anchor
       *  is a compile error instead of a spotlight pointing at nothing. */
      target: string;
      advanceOn: LessonSignalSpec;
      /** Where the user must be standing for the target to exist. Run when
       *  the beat arms, before the wait begins. */
      navigate?: { viewId: string };
      /** The target sits inside an open modal dialog (lifts the overlay above
       *  the dialog layer and drops the click blockers). */
      inDialog?: boolean;
    };

export interface LessonSpec {
  id: string;
  /** The chapter this lesson belongs to, for progress and analytics. */
  chapterId: string;
  /** What finishing it pays, once. */
  experience: number;
  steps: LessonStepSpec[];
}

/** The three fields a beat can resolve. */
export type LessonCopyField = "title" | "body" | "cta";

/** The i18n key of one field of one beat, in the `academy` namespace. */
export function lessonStepCopyKey(
  lessonId: string,
  stepId: string,
  field: LessonCopyField,
): string {
  return `lessons.${lessonId}.steps.${stepId}.${field}`;
}

/** The i18n key of the lesson's own name / line, as the path shows it. */
export function lessonCopyKey(
  lessonId: string,
  field: "title" | "description",
): string {
  return `lessons.${lessonId}.${field}`;
}

/**
 * Which copy fields a beat MUST resolve, and which it may. The runner reads
 * this shape to render, and the registry test reads it to check the locale —
 * one statement of the rule, so a beat can never be checked against a
 * different contract than the one it renders under.
 */
export function lessonStepCopyFields(step: LessonStepSpec): {
  required: LessonCopyField[];
  optional: LessonCopyField[];
} {
  switch (step.kind) {
    // The video's Continue label is shared by every lesson (people learn one
    // word for "next"), so a video beat owns no cta of its own.
    case "video":
      return { required: ["title"], optional: ["body"] };
    case "card":
      return { required: ["title", "body", "cta"], optional: [] };
    // A spotlight says ONE thing beside the control it lights, and that is its
    // `body` — a beat without one would point at something and say nothing.
    case "spotlight":
      return { required: ["body"], optional: [] };
  }
}

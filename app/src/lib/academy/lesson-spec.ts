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
 * Which of the three a beat uses depends on its kind ({@link lessonStepCopyFields}):
 * a `card` needs title, body and cta; a `video` needs a title (body optional);
 * a `spotlight` needs the one sentence it whispers, its `body`, plus the label
 * of its own Next when it waits on one; a `panel` needs a title and body (cta
 * optional) and files any words of its own under the same step node.
 * `academy-lesson-registry.test.ts` pins every key a shipped lesson resolves
 * against `locales/en/academy.json`, so a lesson can never ship with a beat
 * that renders a raw key.
 */

import type { AcademyChapterId } from "./academy-chapters.ts";
import type { LessonSignalSpec } from "./lesson-signals.ts";

/**
 * The closed set of interactive panels a lesson can dock: a beat that has to
 * DO something with the user (connect an app, pick an AI Employee) that no
 * real control on screen does in one click. Each id is one component in
 * `components/academy/lessons/lesson-panel.tsx`; the spec names it, so the spec
 * stays plain data.
 */
export const LESSON_PANEL_IDS = ["emailConnect", "emailSender"] as const;

export type LessonPanelId = (typeof LESSON_PANEL_IDS)[number];

/**
 * The closed set of companions a spotlight beat can run while it is up: the
 * lesson's own work around a real control that no data can declare, such as
 * opening a composer with the request already typed, or watching the task it
 * started. Headless; each id is one component in
 * `components/academy/lessons/lesson-companion.tsx`.
 */
export const LESSON_COMPANION_IDS = ["emailAsk", "emailWatch"] as const;

export type LessonCompanionId = (typeof LESSON_COMPANION_IDS)[number];

/**
 * The id of an EARLIER beat a resumed run opens on instead of this one. For a
 * beat that acts on a choice an earlier beat made: choices live in session
 * memory only, so a run resumed after a restart asks again rather than acting
 * on a default the user never confirmed.
 */
type ResumeOn = { resumeOn?: string };

/** One beat of a lesson. */
export type LessonStepSpec =
  /** Watch it happen: the lesson's clip, played by `LessonVideoCard`. */
  | { kind: "video"; id: string; videoId: string }
  /** Narration: a centered card with one button that moves on. */
  | { kind: "card"; id: string }
  /** Do it: the shell dims, the real control lights up, and the beat ends
   *  when the app itself says the taught action happened. */
  | ({
      kind: "spotlight";
      id: string;
      /** CSS selector of the control, built with `tourSelector` — never a
       *  hand-written string, so a renamed anchor is a compile error instead
       *  of a spotlight pointing at nothing. */
      target: string;
      advanceOn: LessonSignalSpec;
      /** Where the user must be standing for the target to exist. Run when
       *  the beat arms, before the wait begins. */
      navigate?: { viewId: string };
      /** The target sits inside an open modal dialog (lifts the overlay above
       *  the dialog layer and drops the click blockers). */
      inDialog?: boolean;
      /** Runs beside the beat for as long as it is up. It may also end the
       *  beat, when what it watches for happens. */
      companion?: LessonCompanionId;
    } & ResumeOn)
  /** Do it here: a docked panel of the lesson's own, for a step no single
   *  real control teaches. It ends when its signal is met, or when the panel
   *  itself says so. */
  | ({
      kind: "panel";
      id: string;
      panel: LessonPanelId;
      advanceOn?: LessonSignalSpec;
    } & ResumeOn);

/** The earlier beat a resumed run opens on instead of `step`, if it names one. */
export function lessonResumeOn(step: LessonStepSpec): string | undefined {
  return step.kind === "spotlight" || step.kind === "panel"
    ? step.resumeOn
    : undefined;
}

/**
 * A host capability a lesson cannot be taught without. `integrations`: the
 * deployment serves the app integrations, so an email can be connected.
 */
export type LessonRequirement = "integrations";

export interface LessonSpec {
  id: string;
  /** The chapter this lesson sits in on the path, and reports under. */
  chapterId: AcademyChapterId;
  /** What the deployment must offer for the lesson to be offered at all. */
  requires?: readonly LessonRequirement[];
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
    // `body` — a beat without one would point at something and say nothing. A
    // stop that only has to be seen also labels its own Next.
    case "spotlight":
      return step.advanceOn.type === "acknowledged"
        ? { required: ["body", "cta"], optional: [] }
        : { required: ["body"], optional: [] };
    case "panel":
      return { required: ["title", "body"], optional: ["cta"] };
  }
}

/** How a run came to be on a beat: it opened there, or the beat before ended. */
export type LessonBeatArrival = "open" | "advance";

/**
 * The view a run must put the user on as a beat arms, or null to leave them
 * where they are.
 *
 * Advancing honours the beat's own `navigate` and nothing else: the beat
 * before it already put the user where the lesson has been standing. OPENING
 * a run (a first beat, or a resumed one) walks back to the nearest beat that
 * navigated, because a resumed run starts wherever the user happens to be (the
 * Academy, most likely) and a spotlight whose target lives on the screen an
 * EARLIER beat navigated to would otherwise point at nothing.
 */
export function lessonBeatView(
  spec: LessonSpec,
  index: number,
  arrival: LessonBeatArrival,
): string | null {
  const own = (step: LessonStepSpec | undefined) =>
    step?.kind === "spotlight" ? (step.navigate?.viewId ?? null) : null;
  if (arrival === "advance") return own(spec.steps[index]);
  for (let at = Math.min(index, spec.steps.length - 1); at >= 0; at--) {
    const view = own(spec.steps[at]);
    if (view !== null) return view;
  }
  return null;
}

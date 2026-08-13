/**
 * What a lesson beat can WAIT ON, and the one pure rule that decides whether
 * it is done.
 *
 * Pure so it unit-tests without React (`app/tests/academy-lesson-signals.test.ts`),
 * exactly like the setup flow's machine (`components/onboarding/in-app-onboarding-flow.ts`):
 * the runner observes the app's live world, hands the reading to
 * {@link lessonAdvance}, and carries out what it says. Nothing here knows
 * which lesson is running.
 *
 * A small, closed vocabulary on purpose. Every signal a lesson could want is
 * one of "the user got somewhere", "the host said something happened" or "a
 * conversation appeared"; growing it means adding a member here and a reading
 * in `components/academy/lessons/use-lesson-signals.ts`, not a new machine.
 */

import type { LessonStepSpec } from "./lesson-spec.ts";

export type LessonSignalSpec =
  /** The named top-level view is the one on screen. */
  | { type: "viewReached"; viewId: string }
  /** Any firehose event of this name arrived AFTER the beat armed
   *  (`packages/protocol/src/events.ts` names them). */
  | { type: "hostEvent"; event: string }
  /** A conversation exists that did not when the beat armed. */
  | { type: "conversationCreated" };

/** The app's world as the armed beat sees it. */
export interface LessonSignals {
  /** The top-level view on screen. */
  viewMode: string;
  /** Host event NAMES seen since the beat armed (deduplicated: a beat waits
   *  for the first one, so repeats carry no extra information). */
  hostEventsSinceArmed: ReadonlySet<string>;
  /**
   * Conversations counted across every agent, or null while the sweep that
   * would answer has not settled — an in-flight sweep reads as zero, which
   * would make every conversation the user already had look brand new.
   */
  conversationCount: number | null;
  /** The same count, snapshotted when the beat armed. Null until the first
   *  settled sweep gives the beat something honest to compare against. */
  conversationBaseline: number | null;
}

/** Whether the world now satisfies what the beat was waiting for. */
export function lessonSignalMet(
  spec: LessonSignalSpec,
  signals: LessonSignals,
): boolean {
  switch (spec.type) {
    case "viewReached":
      return signals.viewMode === spec.viewId;
    case "hostEvent":
      return signals.hostEventsSinceArmed.has(spec.event);
    // Loose by design (v1): ANY agent's conversation count growing past the
    // arrival baseline counts, so a routine firing in the background during
    // the beat would also advance it, and a conversation deleted while
    // another is created nets out to no advance. The tight version needs the
    // setup flow's per-id baseline (`use-send-mission-discipline.ts`); a
    // lesson can be walked again, so the cost of the loose reading is one
    // beat passing early, not lost progress.
    case "conversationCreated":
      return (
        signals.conversationBaseline !== null &&
        signals.conversationCount !== null &&
        signals.conversationCount > signals.conversationBaseline
      );
  }
}

export type LessonAdvance = { kind: "stay" } | { kind: "advance" };

/**
 * The lesson's whole advance rule: only a spotlight beat listens to the world.
 * Video and card beats are narration, and narration ends when the reader says
 * so — their own button advances them.
 */
export function lessonAdvance(
  step: LessonStepSpec,
  signals: LessonSignals,
): LessonAdvance {
  if (step.kind !== "spotlight") return { kind: "stay" };
  return lessonSignalMet(step.advanceOn, signals)
    ? { kind: "advance" }
    : { kind: "stay" };
}

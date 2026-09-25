/**
 * What a lesson beat can WAIT ON, and the one pure rule that decides whether
 * it is done.
 *
 * Pure so it unit-tests without React (`app/tests/academy-lesson-signals.test.ts`):
 * the runner observes the app's live world, hands the reading to
 * {@link lessonAdvance}, and carries out what it says. Nothing here knows
 * which lesson is running.
 *
 * A small, closed vocabulary on purpose. Every signal a lesson could want is
 * one of "the user got somewhere", "the host said something happened", "a
 * conversation appeared", "an app is connected", "the user read it and
 * pressed Next" or "the beat's companion saw it"; growing it means adding a member here and a reading in
 * `components/academy/lessons/use-lesson-signals.ts`, not a new machine.
 */

import type { LessonStepSpec } from "./lesson-spec.ts";

export type LessonSignalSpec =
  /** The named top-level view is the one on screen. */
  | { type: "viewReached"; viewId: string }
  /** Any firehose event of this name arrived AFTER the beat armed
   *  (`packages/protocol/src/events.ts` names them). */
  | { type: "hostEvent"; event: string }
  /** A conversation exists that did not when the beat armed. */
  | { type: "conversationCreated" }
  /** An ACTIVE integration connection exists for any of these toolkits. A
   *  state, not an edge: already connected on arrival means already met. */
  | { type: "integrationConnected"; toolkits: readonly string[] }
  /** Nothing in the world: the beat shows its own Next and the user's press
   *  moves it on (a tour stop that only has to be seen). */
  | { type: "acknowledged" }
  /** The beat's companion ends it: what the beat waits on is one no reading
   *  here can describe (a task from ONE AI Employee, not any conversation),
   *  so the companion watches for it and moves the run on itself. The beat
   *  arms once the companion is ready to see it happen. */
  | { type: "companion" };

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
  /** Toolkits with an active connection, or null while the connections list
   *  has not answered (or the beat is not waiting on one). */
  activeToolkits: ReadonlySet<string> | null;
  /** The beat's companion has taken what it needs to see the taught action
   *  happen. False on every beat until its companion says so. */
  companionReady: boolean;
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
    case "integrationConnected":
      return (
        signals.activeToolkits !== null &&
        spec.toolkits.some((toolkit) => signals.activeToolkits?.has(toolkit))
      );
    // The press is the runner's own `next`, and the companion calls it
    // itself: neither is a reading of the world.
    case "acknowledged":
    case "companion":
      return false;
  }
}

export type LessonAdvance = { kind: "stay" } | { kind: "advance" };

/**
 * The lesson's whole advance rule: a spotlight beat, and a panel beat that
 * names a signal, listen to the world. Video and card beats are narration, and
 * narration ends when the reader says so — their own button advances them, as
 * a panel's own controls advance a panel that names no signal.
 */
export function lessonAdvance(
  step: LessonStepSpec,
  signals: LessonSignals,
): LessonAdvance {
  const advanceOn = lessonBeatSignal(step);
  if (advanceOn === null) return { kind: "stay" };
  return lessonSignalMet(advanceOn, signals)
    ? { kind: "advance" }
    : { kind: "stay" };
}

/** What a beat waits on in the world, or null for one that waits on nothing. */
export function lessonBeatSignal(
  step: LessonStepSpec,
): LessonSignalSpec | null {
  switch (step.kind) {
    case "spotlight":
      return step.advanceOn;
    case "panel":
      return step.advanceOn ?? null;
    case "video":
    case "card":
      return null;
  }
}

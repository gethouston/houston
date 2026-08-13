import type { LessonSignals } from "../../../lib/academy/lesson-signals.ts";
import type { LessonStepSpec } from "../../../lib/academy/lesson-spec.ts";

/**
 * Whether a beat may hand the user the real control it points at.
 *
 * The companion rule to `lessonAdvance`: that one says when a beat is OVER,
 * this one says when it is allowed to BEGIN. A beat that decides by comparing
 * the world against a snapshot of it is blind until the snapshot exists, and a
 * click that lands in that blind window is the one act the lesson can never
 * see: the conversation the user just made becomes part of the baseline, the
 * count and the baseline agree forever, and the run is stranded on a beat the
 * user has already done.
 *
 * So the whisper keeps the veil whole until its reading is ready — the target
 * is not merely unlit, it is not reachable — and the beat opens the moment the
 * snapshot lands. Pure, so it is decided once and tested without React
 * (`app/tests/academy-lesson-arming.test.ts`).
 */
export function lessonBeatArmed(
  step: LessonStepSpec,
  signals: LessonSignals,
): boolean {
  // Narration points at nothing: there is no target to hold shut.
  if (step.kind !== "spotlight") return true;
  switch (step.advanceOn.type) {
    // The snapshot arrives with a cross-agent sweep, which the beat has to
    // wait for. Null is "not taken yet"; zero is a real, empty baseline.
    case "conversationCreated":
      return signals.conversationBaseline !== null;
    // Both read the world as it is from the beat's first commit: the view is
    // already on screen, and the event subscription is attached before the
    // browser can paint the beat, so neither has a blind window to protect.
    case "viewReached":
    case "hostEvent":
      return true;
  }
}

/**
 * Whether a keydown is the user asking to leave the lesson.
 *
 * The run takes Escape from the whole window (capture, on `window`), which
 * means it also hears keys the APP dispatches at itself: leaving a kept-alive
 * screen with a modal open fires a synthetic Escape to close it
 * (`components/shell/keep-alive-views.tsx`). Trusted-only, so that housekeeping
 * cannot silently end a run the user is in the middle of.
 */
export function lessonExitKey(event: {
  key: string;
  defaultPrevented: boolean;
  isTrusted: boolean;
}): boolean {
  return event.key === "Escape" && !event.defaultPrevented && event.isTrusted;
}

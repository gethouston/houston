import type { LessonSpec } from "../../../lib/academy/lesson-spec.ts";

/**
 * How far a run has come, as the beat surfaces report it.
 *
 * Pure and stated once, because the counter rides on EVERY beat (the docked
 * panel and the whisper both show it) and two surfaces that count differently
 * would tell the same user two stories about the same lesson.
 */

/**
 * The beat that is playing, 1-based. A finished run reports the last beat
 * rather than one past the end: the finishing commit clears the run while the
 * surface is still mounted, and nobody must ever be told "4 / 3" on the way
 * out.
 */
export function lessonStepPosition(spec: LessonSpec, current: number): number {
  return Math.min(Math.max(current + 1, 1), spec.steps.length);
}

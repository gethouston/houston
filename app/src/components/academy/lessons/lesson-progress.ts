import type { LessonSpec } from "../../../lib/academy/lesson-spec.ts";

export function lessonStepPosition(spec: LessonSpec, current: number): number {
  return Math.min(Math.max(current + 1, 1), spec.steps.length);
}

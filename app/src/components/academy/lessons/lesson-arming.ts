import type { LessonSignals } from "../../../lib/academy/lesson-signals.ts";
import type { LessonStepSpec } from "../../../lib/academy/lesson-spec.ts";

export function lessonBeatArmed(
  step: LessonStepSpec,
  signals: LessonSignals,
): boolean {
  if (step.kind !== "spotlight") return true;
  switch (step.advanceOn.type) {
    case "conversationCreated":
      return signals.conversationBaseline !== null;
    case "viewReached":
    case "hostEvent":
      return true;
    case "integrationConnected":
      return true;
    case "acknowledged":
      return true;
    case "companion":
      return signals.companionReady;
  }
}

export function lessonExitKey(event: {
  key: string;
  defaultPrevented: boolean;
  isTrusted: boolean;
}): boolean {
  return event.key === "Escape" && !event.defaultPrevented && event.isTrusted;
}

import type { LessonStepSpec } from "./lesson-spec.ts";

export type LessonSignalSpec =
  | { type: "viewReached"; viewId: string }
  | { type: "hostEvent"; event: string }
  | { type: "conversationCreated" }
  | { type: "integrationConnected"; toolkits: readonly string[] }
  | { type: "acknowledged" }
  | { type: "companion" };

export interface LessonSignals {
  viewMode: string;
  hostEventsSinceArmed: ReadonlySet<string>;
  conversationCount: number | null;
  conversationBaseline: number | null;
  activeToolkits: ReadonlySet<string> | null;
  companionReady: boolean;
}

export function lessonSignalMet(
  spec: LessonSignalSpec,
  signals: LessonSignals,
): boolean {
  switch (spec.type) {
    case "viewReached":
      return signals.viewMode === spec.viewId;
    case "hostEvent":
      return signals.hostEventsSinceArmed.has(spec.event);
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
    case "acknowledged":
    case "companion":
      return false;
  }
}

export type LessonAdvance = { kind: "stay" } | { kind: "advance" };

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

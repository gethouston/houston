import type { GuidedCreateAgentStep } from "./create-agent-steps-model";

/** The answers the guided setup has collected, as the user reads them. */
export interface GuidedStepAnswers {
  context: string;
  role: string;
}

/** A question the last step can send the user back to. The id IS the step it
 *  returns to, so the recap can never point at a screen that does not exist. */
export type RecapSegmentId = Exclude<GuidedCreateAgentStep, "customize">;

export interface RecapSegment {
  id: RecapSegmentId;
  /** The answer as the user reads it, already trimmed. */
  label: string;
}

/**
 * The answers the last step recaps, in the order they were given. An answer
 * that is still blank has no segment: the recap shows what the user actually
 * said, never an empty control that leads somewhere unexplained.
 *
 * This is the ONE place the collected answers are shown back. The sheet's
 * header carries the three step names alone — its row is 48px tall and holds
 * the way back and the way out beside them, so an answer hung under each name
 * would either crowd them or move the row between steps, and a header that
 * changes height mid-flow is exactly what the one sheet exists to stop.
 */
export function recapSegments(answers: GuidedStepAnswers): RecapSegment[] {
  const segments: RecapSegment[] = [
    { id: "context", label: answers.context.trim() },
    { id: "role", label: answers.role.trim() },
  ];
  return segments.filter((segment) => segment.label.length > 0);
}

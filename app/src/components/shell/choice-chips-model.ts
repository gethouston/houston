import type { ChoiceSection } from "./choice-step-model";

/**
 * How ONE question of chips is announced.
 *
 * A question has one answer, so it is ONE radio group however many labelled
 * runs it is drawn in: a group per run would announce several answers where
 * the arrows walk a single grid across them all, and a listener counting
 * groups would go hunting for questions that do not exist. So the group wraps
 * every run, is named for the question, and carries the arrow-key hint once —
 * and each run's heading is then a sighted label alone, read as the text it is.
 *
 * `choice-runs.tsx` renders exactly what this returns, which is what makes
 * "one question, one group" a thing that can be tested without a browser.
 */
export interface ChoiceQuestionAria {
  group: {
    role: "radiogroup";
    "aria-label": string;
    "aria-describedby": string | undefined;
  };
  /** One per run, in order: what that run's heading is announced as. */
  headings: { role: "presentation" }[];
}

export function choiceQuestionAria(
  headline: string,
  runs: readonly ChoiceSection[],
  hint: { id: string; text?: string },
): ChoiceQuestionAria {
  return {
    group: {
      role: "radiogroup",
      "aria-label": headline,
      "aria-describedby": hint.text ? hint.id : undefined,
    },
    headings: runs.map(() => ({ role: "presentation" })),
  };
}

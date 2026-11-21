import type { ChoiceSection } from "./choice-step-model";

export interface ChoiceQuestionAria {
  group: {
    role: "radiogroup";
    "aria-label": string;
    "aria-describedby": string | undefined;
  };
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

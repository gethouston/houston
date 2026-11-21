import type { InteractionStep } from "@houston/protocol";
import { hasOnlySuggestionSteps } from "@houston/protocol/interaction";

export type SuggestActionsStep = Extract<
  InteractionStep,
  { kind: "suggest_actions" }
>;

export type SuggestActionsOverride =
  | { kind: "bubbles"; step: SuggestActionsStep }
  | { kind: "none" };

export function resolveSuggestActionsOverride(
  steps: InteractionStep[],
  dismissedId: string | null,
): SuggestActionsOverride {
  if (!hasOnlySuggestionSteps(steps)) return { kind: "none" };
  const step = steps.find((candidate) => candidate.kind === "suggest_actions");
  if (!step || dismissedId === step.id) return { kind: "none" };
  return { kind: "bubbles", step };
}

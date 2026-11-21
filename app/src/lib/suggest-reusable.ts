import type { InteractionStep } from "@houston/protocol";
import { hasOnlySuggestionSteps } from "@houston/protocol/interaction";

export type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;

export type SuggestReusableOverride =
  | { kind: "card"; step: SuggestReusableStep }
  | { kind: "none" };

export function resolveSuggestReusableOverride(
  steps: InteractionStep[],
  dismissedId: string | null,
): SuggestReusableOverride {
  if (!hasOnlySuggestionSteps(steps)) return { kind: "none" };
  const step = steps.find((candidate) => candidate.kind === "suggest_reusable");
  if (!step) return { kind: "none" };
  return dismissedId === step.id ? { kind: "none" } : { kind: "card", step };
}

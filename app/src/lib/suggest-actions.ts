import type { InteractionStep } from "@houston/protocol";
// Subpath import (like `active-interaction.ts`): the app's node:test runner
// loads value imports for real, and the package index's extensionless import
// chain only resolves under bundler resolution.
import { hasOnlySuggestionSteps } from "@houston/protocol/interaction";

export type SuggestActionsStep = Extract<
  InteractionStep,
  { kind: "suggest_actions" }
>;

export type SuggestActionsOverride =
  | { kind: "bubbles"; step: SuggestActionsStep }
  | { kind: "none" };

/** Resolve the optional action bubbles independently of another optional offer. */
export function resolveSuggestActionsOverride(
  steps: InteractionStep[],
  dismissedId: string | null,
): SuggestActionsOverride {
  // Any blocking step wins: the stepper owns the composer instead.
  if (!hasOnlySuggestionSteps(steps)) return { kind: "none" };
  const step = steps.find((candidate) => candidate.kind === "suggest_actions");
  if (!step || dismissedId === step.id) return { kind: "none" };
  return { kind: "bubbles", step };
}

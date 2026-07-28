import type { InteractionStep } from "@houston/protocol";

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
  if (
    steps.some(
      (candidate) =>
        candidate.kind !== "suggest_actions" &&
        candidate.kind !== "suggest_reusable",
    )
  )
    return { kind: "none" };
  const step = steps.find((candidate) => candidate.kind === "suggest_actions");
  if (!step || dismissedId === step.id) return { kind: "none" };
  return { kind: "bubbles", step };
}

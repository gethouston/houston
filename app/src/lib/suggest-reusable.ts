import type { InteractionStep } from "@houston/protocol";

/** A suggest_reusable step: the model called `suggest_reusable` on a clean
 *  finish to offer saving the just-completed work as a Skill, Routine, or Learning.
 *  It can coexist with suggest_actions. Extracted from the protocol union so the
 *  app narrows to it. */
export type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;

/**
 * Which composer-replacing surface a pending interaction's steps resolve to for
 * the reusable-save offer:
 *
 *  - `card` — an optional suggest_reusable step that hasn't been dismissed → the
 *             ChatSuggestReusableCard, carrying the proposed title + rationale.
 *  - `none` — a dismissed offer, a sequence with a blocking step, or no
 *             suggest_reusable offer → no card.
 *
 * Unlike plan-ready's resolver there is NO "stepper" branch here: the optional
 * offers can coexist with each other, while blocking steps are handled by the
 * interaction stepper instead.
 *
 * `dismissedId` is the id of the offer the user chose to skip: dismissal is
 * per-step-id, so a LATER, different suggestion (different id) re-shows the card.
 * Pure so the branch is unit-tested without the panel's event plumbing.
 */
export type SuggestReusableOverride =
  | { kind: "card"; step: SuggestReusableStep }
  | { kind: "none" };

export function resolveSuggestReusableOverride(
  steps: InteractionStep[],
  dismissedId: string | null,
): SuggestReusableOverride {
  if (
    steps.some(
      (candidate) =>
        candidate.kind !== "suggest_reusable" &&
        candidate.kind !== "suggest_actions",
    )
  )
    return { kind: "none" };
  const step = steps.find((candidate) => candidate.kind === "suggest_reusable");
  if (!step) return { kind: "none" };
  return dismissedId === step.id ? { kind: "none" } : { kind: "card", step };
}

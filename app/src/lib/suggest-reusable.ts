import type { InteractionStep } from "@houston/protocol";

/** A suggest_reusable step: the model called `suggest_reusable` on a clean
 *  finish to offer saving the just-completed work as a Skill, Routine, or Learning. It
 *  reaches the frontend as a lone step in a `PendingInteraction`, exactly like
 *  plan_ready. Extracted from the protocol union so the app narrows to it. */
export type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;

/**
 * Which composer-replacing surface a pending interaction's steps resolve to for
 * the reusable-save offer:
 *
 *  - `card` — a lone suggest_reusable step that hasn't been dismissed → the
 *             ChatSuggestReusableCard, carrying the proposed title + rationale.
 *  - `none` — a lone suggest_reusable step the user dismissed ("Not now"), or
 *             the steps are not a lone suggest_reusable offer → no card.
 *
 * Unlike plan-ready's resolver there is NO "stepper" branch here: a
 * suggest_reusable step is mutually exclusive with every other step kind by
 * construction on the runtime side (it arrives alone on a clean-finish `done`
 * frame; see `packages/protocol/src/domain/interaction.ts` and `turn-settle.ts`
 * `finishOk`), so it never coexists with question / signin / connect / plan_ready
 * steps and there is nothing to route into the interaction stepper.
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
  const lone =
    steps.length === 1 && steps[0].kind === "suggest_reusable"
      ? steps[0]
      : null;
  if (!lone) return { kind: "none" };
  return dismissedId === lone.id
    ? { kind: "none" }
    : { kind: "card", step: lone };
}

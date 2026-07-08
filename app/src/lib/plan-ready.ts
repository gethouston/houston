import type { InteractionStep } from "@houston/protocol";

/** A plan_ready step: the model called `plan_ready` with the drafted plan. It
 *  reaches the frontend as a lone step in a `PendingInteraction`, exactly like
 *  ask_user. Extracted from the protocol union so the app narrows to it. */
export type PlanReadyStep = Extract<InteractionStep, { kind: "plan_ready" }>;

/** Every interaction step that is NOT a plan_ready step (question / signin /
 *  connect). These are the ones the existing ChatInteractionCard stepper walks;
 *  a plan_ready step never belongs in that stepper. */
export type NonPlanReadyStep = Exclude<InteractionStep, { kind: "plan_ready" }>;

/**
 * Which composer-replacing surface a pending interaction's steps resolve to:
 *
 *  - `card`    — a lone plan_ready step that hasn't been dismissed → the
 *                ChatPlanReadyCard, carrying its plan summary.
 *  - `stepper` — anything else with at least one non-plan_ready step → the
 *                existing ChatInteractionCard, over the plan_ready-free steps
 *                (defensive: a plan_ready step never enters the stepper).
 *  - `none`    — a lone plan_ready step the user dismissed ("Keep planning"),
 *                or nothing renderable → the composer returns.
 *
 * `dismissed` is the summary of the plan_ready step the user chose to keep
 * planning on: a LATER, different plan (different summary) re-shows the card.
 * Pure so the branch is unit-tested without the panel's event plumbing.
 */
export type PlanReadyOverride =
  | { kind: "card"; summary: string }
  | { kind: "stepper"; steps: NonPlanReadyStep[] }
  | { kind: "none" };

export function resolvePlanReadyOverride(
  steps: InteractionStep[],
  dismissed: string | null,
): PlanReadyOverride {
  const lone =
    steps.length === 1 && steps[0].kind === "plan_ready" ? steps[0] : null;
  if (lone) {
    return dismissed === lone.summary
      ? { kind: "none" }
      : { kind: "card", summary: lone.summary };
  }
  const rest = steps.filter(
    (step): step is NonPlanReadyStep => step.kind !== "plan_ready",
  );
  return rest.length > 0 ? { kind: "stepper", steps: rest } : { kind: "none" };
}

import type { InteractionStep } from "@houston/protocol";

export type PlanReadyStep = Extract<InteractionStep, { kind: "plan_ready" }>;

export type NonPlanReadyStep = Exclude<
  InteractionStep,
  | { kind: "plan_ready" }
  | { kind: "suggest_reusable" }
  | { kind: "suggest_actions" }
>;

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
    (step): step is NonPlanReadyStep =>
      step.kind !== "plan_ready" &&
      step.kind !== "suggest_reusable" &&
      step.kind !== "suggest_actions",
  );
  return rest.length > 0 ? { kind: "stepper", steps: rest } : { kind: "none" };
}

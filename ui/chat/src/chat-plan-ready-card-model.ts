// Shared labels + a pure presentation resolver for ChatPlanReadyCard. DOM-free
// (mirroring interaction-card-model.ts) so the node:test suite can drive the
// button ordering/variant/disabled decision without a DOM runner; the .tsx
// component maps the resolved descriptors to buttons verbatim.

/** English defaults live in the app; consumers pass `t()` results in. This
 *  constant is the fallback for apps that don't localize the card yet. */
export interface ChatPlanReadyLabels {
  title: string;
  startWorking: string;
  runAutopilot: string;
  keepPlanning: string;
}

/** English fallbacks for apps that don't localize the plan-ready card yet.
 *  No em dashes. */
export const DEFAULT_PLAN_READY_LABELS: ChatPlanReadyLabels = {
  title: "Plan ready",
  startWorking: "Start working",
  runAutopilot: "Run on Autopilot",
  keepPlanning: "Keep planning",
};

/** Stable key for each action, so the .tsx wires the right callback. */
export type PlanReadyActionKey =
  | "startWorking"
  | "runAutopilot"
  | "keepPlanning";

/** The button variant each action renders as, on the grey (bg-secondary) card
 *  surface: the primary commit is filled, the autopilot alternative is a raised
 *  outline chip (distinct on grey, never grey-on-grey), and the quiet dismissal
 *  is a ghost. */
export type PlanReadyActionVariant = "default" | "outline" | "ghost";

/** One resolved button descriptor: its stable key, its localized label, the
 *  variant it renders as, and whether it is disabled. */
export interface PlanReadyAction {
  key: PlanReadyActionKey;
  label: string;
  variant: PlanReadyActionVariant;
  disabled: boolean;
}

/**
 * The three actions in render order: Start working (primary) -> Run on
 * Autopilot (raised outline) -> Keep planning (quiet ghost). `disabled` gates
 * ALL three uniformly, so the whole card reads as inert while another turn is
 * active. Pure so the ordering/variant/disabled mapping is unit-tested without
 * a DOM.
 */
export function resolvePlanReadyActions(
  labels: ChatPlanReadyLabels,
  disabled: boolean,
): PlanReadyAction[] {
  return [
    {
      key: "startWorking",
      label: labels.startWorking,
      variant: "default",
      disabled,
    },
    {
      key: "runAutopilot",
      label: labels.runAutopilot,
      variant: "outline",
      disabled,
    },
    {
      key: "keepPlanning",
      label: labels.keepPlanning,
      variant: "ghost",
      disabled,
    },
  ];
}

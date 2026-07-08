// Shared labels + a pure presentation resolver for ChatPlanReadyCard. DOM-free
// (mirroring interaction-card-model.ts) so the node:test suite can drive the
// row ordering/content/disabled decision without a DOM runner; the .tsx
// component maps the resolved descriptors to rows verbatim (icons are internal
// to the component).

/** English defaults live in the app; consumers pass `t()` results in. This
 *  constant is the fallback for apps that don't localize the card yet. Each
 *  option carries a title (icon sits inline with it in the .tsx) and a
 *  one-line description on its own line, matching the composer mode menu. */
export interface ChatPlanReadyLabels {
  title: string;
  coworkerTitle: string;
  coworkerDescription: string;
  autopilotTitle: string;
  autopilotDescription: string;
  keepPlanningTitle: string;
  keepPlanningDescription: string;
}

/** English fallbacks for apps that don't localize the plan-ready card yet.
 *  No em dashes. */
export const DEFAULT_PLAN_READY_LABELS: ChatPlanReadyLabels = {
  title: "Plan ready",
  coworkerTitle: "Continue in Coworker mode",
  coworkerDescription: "Works with you and asks when unsure.",
  autopilotTitle: "Continue in Autopilot mode",
  autopilotDescription: "Finishes it on its own. No questions asked.",
  keepPlanningTitle: "Keep planning",
  keepPlanningDescription: "Stay here and adjust the plan.",
};

/** Stable key for each action, so the .tsx wires the right callback + icon. */
export type PlanReadyActionKey =
  | "startWorking"
  | "runAutopilot"
  | "keepPlanning";

/** One resolved row descriptor: its stable key, its localized title +
 *  description, and whether it is disabled. Icons are internal to the .tsx. */
export interface PlanReadyAction {
  key: PlanReadyActionKey;
  title: string;
  description: string;
  disabled: boolean;
}

/**
 * The three options in render order: Continue in Coworker mode (execute) ->
 * Continue in Autopilot mode (auto) -> Keep planning (dismiss). Rendered as
 * full-width mode-menu rows (icon inline with the title, description below).
 * Primary emphasis comes from row order + title weight, not a filled button.
 * `disabled` gates ALL three uniformly, so the whole card reads as inert while
 * another turn is active. Pure so the ordering/content/disabled mapping is
 * unit-tested without a DOM.
 */
export function resolvePlanReadyActions(
  labels: ChatPlanReadyLabels,
  disabled: boolean,
): PlanReadyAction[] {
  return [
    {
      key: "startWorking",
      title: labels.coworkerTitle,
      description: labels.coworkerDescription,
      disabled,
    },
    {
      key: "runAutopilot",
      title: labels.autopilotTitle,
      description: labels.autopilotDescription,
      disabled,
    },
    {
      key: "keepPlanning",
      title: labels.keepPlanningTitle,
      description: labels.keepPlanningDescription,
      disabled,
    },
  ];
}

export interface ChatPlanReadyLabels {
  title: string;
  collapse: string;
  expand: string;
  askFirstTitle: string;
  askFirstDescription: string;
  autopilotTitle: string;
  autopilotDescription: string;
  dismiss: string;
  feedbackPlaceholder: string;
  send: string;
}

export const DEFAULT_PLAN_READY_LABELS: ChatPlanReadyLabels = {
  title: "Plan ready",
  collapse: "Collapse plan approval",
  expand: "Expand plan approval",
  askFirstTitle: "Continue in Ask first mode",
  askFirstDescription: "Gets things done, asks before sensitive actions.",
  autopilotTitle: "Continue in Autopilot mode",
  autopilotDescription: "Finishes it on its own. No questions asked.",
  dismiss: "Dismiss",
  feedbackPlaceholder: "Give feedback on the plan...",
  send: "Send",
};

export const PLAN_READY_LEDE_CLASS_NAME = "line-clamp-2";

export const hasPlanReadySummary = (summary: string): boolean =>
  summary.trim().length > 0;

export type PlanReadyActionKey = "startWorking" | "runAutopilot";

export interface PlanReadyAction {
  key: PlanReadyActionKey;
  title: string;
  description: string;
  disabled: boolean;
}

export function resolvePlanReadyActions(
  labels: ChatPlanReadyLabels,
  disabled: boolean,
): PlanReadyAction[] {
  return [
    {
      key: "startWorking",
      title: labels.askFirstTitle,
      description: labels.askFirstDescription,
      disabled,
    },
    {
      key: "runAutopilot",
      title: labels.autopilotTitle,
      description: labels.autopilotDescription,
      disabled,
    },
  ];
}

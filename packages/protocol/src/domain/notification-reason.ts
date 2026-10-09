import { isPendingInteraction, parsePendingInteraction } from "./interaction";
import type { PendingInteraction } from "./interaction-types";

export type NotificationReason =
  | "finished"
  | "question"
  | "signin"
  | "connect"
  | "credential"
  | "hands_on"
  | "error";

/** The first unmet need determines the notification copy. */
export function notificationReason(
  status: "needs_you" | "error",
  interaction: PendingInteraction | null | undefined,
): { reason: NotificationReason; question_count: number } {
  if (status === "error") return { reason: "error", question_count: 0 };
  const valid = isPendingInteraction(interaction)
    ? parsePendingInteraction(interaction)
    : undefined;
  const steps = valid?.steps ?? [];
  const questionCount = steps.filter((step) => step.kind === "question").length;
  if (questionCount)
    return { reason: "question", question_count: questionCount };
  if (steps.some((step) => step.kind === "signin"))
    return { reason: "signin", question_count: 0 };
  if (
    steps.some(
      (step) => step.kind === "connect" || step.kind === "provider_connect",
    )
  )
    return { reason: "connect", question_count: 0 };
  if (steps.some((step) => step.kind === "credential"))
    return { reason: "credential", question_count: 0 };
  if (steps.some((step) => step.kind === "hands_on"))
    return { reason: "hands_on", question_count: 0 };
  return { reason: "finished", question_count: 0 };
}

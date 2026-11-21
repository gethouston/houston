import type { PendingInteraction } from "@houston/protocol";
import { notificationReason } from "@houston/protocol";
import {
  hasOnlySuggestionSteps,
  isPendingInteraction,
  retainSuggestionSteps,
} from "@houston/protocol/interaction";
import type { BoardStatus } from "@houston/sdk";

export function deriveActiveInteraction(args: {
  running: boolean;
  live: PendingInteraction | null | undefined;
  persisted: PendingInteraction | null | undefined;
  missionStatus: string | null | undefined;
}): PendingInteraction | null {
  if (args.running) return null;
  const winner = isPendingInteraction(args.live)
    ? args.live
    : isPendingInteraction(args.persisted)
      ? args.persisted
      : null;
  if (!winner || args.missionStatus !== "done") return winner;
  if (hasOnlySuggestionSteps(winner.steps)) return winner;
  const cached = strippedCache.get(winner);
  if (cached !== undefined) return cached;
  const stripped = retainSuggestionSteps(winner) ?? null;
  strippedCache.set(winner, stripped);
  return stripped;
}

const strippedCache = new WeakMap<
  PendingInteraction,
  PendingInteraction | null
>();

export function interactionQuestionCount(
  interaction: PendingInteraction | null | undefined,
): number {
  if (!isPendingInteraction(interaction)) return 0;
  return interaction.steps.filter((step) => step.kind === "question").length;
}

export function interactionNotificationBodyKey(
  interaction: PendingInteraction | null | undefined,
):
  | "sessionComplete.body"
  | "sessionComplete.question"
  | "sessionComplete.signin"
  | "sessionComplete.connect"
  | "sessionComplete.credential"
  | "sessionComplete.handsOn" {
  const reason = notificationReason("needs_you", interaction).reason;
  const keys = {
    finished: "sessionComplete.body",
    question: "sessionComplete.question",
    signin: "sessionComplete.signin",
    connect: "sessionComplete.connect",
    credential: "sessionComplete.credential",
    hands_on: "sessionComplete.handsOn",
    error: "sessionComplete.body",
  } as const;
  return keys[reason];
}

export function completionInteractionReady(
  boardStatus: BoardStatus | null | undefined,
): boolean {
  return boardStatus != null && boardStatus !== "running";
}

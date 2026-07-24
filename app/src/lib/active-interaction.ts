import type { PendingInteraction } from "@houston/protocol";
// Subpath import (like @houston/protocol/model-windows): the app's node:test
// runner loads value imports for real, and the package index's extensionless
// import chain only resolves under bundler resolution.
import { isPendingInteraction } from "@houston/protocol/interaction";
import type { BoardStatus } from "@houston/sdk";

/**
 * The one interaction the open conversation is waiting on the user for, or
 * null. Drives the composer-replacing card (see `useAgentChatPanel`) and the
 * differentiated completion notification.
 *
 * Two sources, in priority order:
 *  1. `live` — the SDK conversation VM's `pendingInteraction`, set when THIS
 *     client settled the turn on an `ask_user` / `request_connection`.
 *  2. `persisted` — the activity's `pending_interaction`, the reload/observer
 *     case: a client that never saw the live `done` frame reads the interaction
 *     the engine stamped onto the board card.
 *
 * The override is shown ONLY when no turn is running: a fresh turn clears the
 * VM interaction (running + null) the instant it starts, so returning null
 * while `running` makes the card disappear through the same reactivity the
 * turn start already drives — no separate teardown.
 */
export function deriveActiveInteraction(args: {
  running: boolean;
  live: PendingInteraction | null | undefined;
  persisted: PendingInteraction | null | undefined;
}): PendingInteraction | null {
  if (args.running) return null;
  // Both sources are persisted data that can outlive the code that wrote it
  // (an activity or message from a pre-step build has no `steps`): render only
  // a structurally valid sequence, treat anything else as absent.
  if (isPendingInteraction(args.live)) return args.live;
  if (isPendingInteraction(args.persisted)) return args.persisted;
  return null;
}

/**
 * How many question steps a pending interaction carries (0 when none). Drives
 * the pluralized "question(s)" completion copy — a mixed sequence counts only
 * its questions, never its connect steps. Pure so the count is unit-tested
 * without the event plumbing.
 */
export function interactionQuestionCount(
  interaction: PendingInteraction | null | undefined,
): number {
  if (!isPendingInteraction(interaction)) return 0;
  return interaction.steps.filter((step) => step.kind === "question").length;
}

/**
 * Which completion-notification body an ended turn takes, by FIRST unmet need
 * (steps are ordered questions → sign-in → connections). A sequence with ANY
 * question steps reads as the (pluralized) question body; else a sign-in step
 * reads as the sign-in body; else a connect step reads as the connect body;
 * everything else (a clean finish, a user stop, a provider error) reads as the
 * plain "finished" body. Pure so the copy mapping is unit-tested without the
 * event plumbing.
 */
export function interactionNotificationBodyKey(
  interaction: PendingInteraction | null | undefined,
):
  | "sessionComplete.body"
  | "sessionComplete.question"
  | "sessionComplete.signin"
  | "sessionComplete.connect"
  | "sessionComplete.credential" {
  if (interactionQuestionCount(interaction) > 0)
    return "sessionComplete.question";
  if (
    isPendingInteraction(interaction) &&
    interaction.steps.some((step) => step.kind === "signin")
  )
    return "sessionComplete.signin";
  if (
    isPendingInteraction(interaction) &&
    interaction.steps.some((step) => step.kind === "connect")
  )
    return "sessionComplete.connect";
  if (
    isPendingInteraction(interaction) &&
    interaction.steps.some((step) => step.kind === "credential")
  )
    return "sessionComplete.credential";

  return "sessionComplete.body";
}

/**
 * Whether a completed session's notification body is READY to read: true once
 * the turn's terminal board persist has folded (`boardStatus` left "running"),
 * which is the same instant the settled interaction becomes readable. Until
 * then a latched completion must not fire on an `ActivityChanged` echo — that
 * echo may belong to a sibling session or an unrelated `.houston` write (the
 * event carries no session key), and firing early would send the plain body.
 * `null`/`undefined` (no board card folded) stays not-ready; the grace timer is
 * that case's backstop. Pure so the gate is unit-tested without event plumbing.
 */
export function completionInteractionReady(
  boardStatus: BoardStatus | null | undefined,
): boolean {
  return boardStatus != null && boardStatus !== "running";
}

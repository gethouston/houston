import type { PendingInteraction } from "@houston/protocol";
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
  return args.live ?? args.persisted ?? null;
}

/**
 * Which completion-notification body an ended turn takes. `question` and
 * `connect` are the two "the agent needs you" settles; everything else (a clean
 * finish, a user stop, a provider error) reads as the plain "finished" body.
 * Pure so the copy mapping is unit-tested without the event plumbing.
 */
export function interactionNotificationBodyKey(
  interaction: PendingInteraction | null | undefined,
):
  | "sessionComplete.body"
  | "sessionComplete.question"
  | "sessionComplete.connect" {
  if (interaction?.kind === "question") return "sessionComplete.question";
  if (interaction?.kind === "connect") return "sessionComplete.connect";
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

import type { PendingInteraction } from "@houston/protocol";
// Subpath import (like @houston/protocol/model-windows): the app's node:test
// runner loads value imports for real, and the package index's extensionless
// import chain only resolves under bundler resolution.
import {
  hasOnlySuggestionSteps,
  isPendingInteraction,
  retainSuggestionSteps,
} from "@houston/protocol/interaction";
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
 *
 * `missionStatus` is the board status of the mission this conversation belongs
 * to, and it applies the SAME strip rule the write seams apply: on `done` the
 * blocking steps are void (the user's move to Done answered them) and only the
 * clean-finish offers keep rendering. It has to be applied HERE too, because
 * only the persisted side gets rewritten by that move: the VM's
 * `pendingInteraction` is written at turn start/settle and a board write never
 * touches it, so without this a Done card kept showing the live question
 * stepper until an app reload. Live and reload must agree.
 *
 * Every other status (`needs_you`, `error`, `running`, `archived`, unknown) is
 * untouched: only Done is the user answering the mission.
 */
export function deriveActiveInteraction(args: {
  running: boolean;
  live: PendingInteraction | null | undefined;
  persisted: PendingInteraction | null | undefined;
  missionStatus: string | null | undefined;
}): PendingInteraction | null {
  if (args.running) return null;
  // Both sources are persisted data that can outlive the code that wrote it
  // (an activity or message from a pre-step build has no `steps`): render only
  // a structurally valid sequence, treat anything else as absent.
  const winner = isPendingInteraction(args.live)
    ? args.live
    : isPendingInteraction(args.persisted)
      ? args.persisted
      : null;
  if (!winner || args.missionStatus !== "done") return winner;
  // Nothing to strip: hand back the SAME reference.
  if (hasOnlySuggestionSteps(winner.steps)) return winner;
  const cached = strippedCache.get(winner);
  if (cached !== undefined) return cached;
  const stripped = retainSuggestionSteps(winner) ?? null;
  strippedCache.set(winner, stripped);
  return stripped;
}

/**
 * One stripped result per source interaction, so a Done mission's derivation is
 * reference-STABLE like every other branch.
 *
 * Two callers depend on that identity and would misbehave without it: the
 * panel's override memo keeps the stepper's in-progress outcomes in its body
 * (they must not reset while the user walks the steps), and the per-step offer
 * dismissal chains its writes on it (a fresh object mid-sequence would restart
 * the chain and resurrect an already-dismissed offer). The strip runs on the
 * LIVE interaction, which a dismissal does not rewrite, so it would otherwise
 * re-mint a new object every time the persisted side changed underneath it.
 *
 * Weak: an entry dies with the interaction it describes.
 */
const strippedCache = new WeakMap<
  PendingInteraction,
  PendingInteraction | null
>();

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

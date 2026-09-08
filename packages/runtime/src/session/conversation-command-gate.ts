import { isTurnRunning } from "./bus";
import { conversations } from "./conversation-cache";

/**
 * THE MUTUAL EXCLUSION BETWEEN A CONVERSATION'S TURNS AND ITS COMMANDS.
 *
 * A conversation command (`/clear`, `/compact`) rewrites the context a turn
 * runs in — `/clear` tears the live session down and writes a boundary the
 * later context is read from. So the two can never overlap: a turn accepted
 * while a command is working would be interrupted mid-flight and its message
 * excluded from everything after the boundary, and a command accepted behind a
 * turn would yank that turn's session out from under it.
 *
 * Ordinary turns exclude each other through the conversation's own queue
 * (`chat.ts` runTurn), which a command joins as well. What the queue alone
 * cannot do is decide ACCEPTANCE: a turn is accepted by the route and only
 * reaches the queue several awaits later (credential sync, session build), and
 * a command whose `/clear` disposes the session must never have a turn parked
 * behind it. So acceptance is gated here, at the one place turns enter the
 * runtime, and the answer is authoritative from the instant the route says yes:
 *
 *  - a turn is HELD from acceptance until it settles (`holdConversationTurn`),
 *  - a command is IN FLIGHT from acceptance until it settles
 *    (`beginConversationCommand`),
 *
 * and each refuses while the other holds the conversation. Both refusals are a
 * structured 409 the caller can act on — never a silently dropped message.
 */

/** Turns accepted for a conversation that have not settled yet. */
const heldTurns = new Map<string, number>();
/** Conversations with a command accepted and not yet settled. */
const commandsInFlight = new Set<string>();

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Hold a conversation against commands for the whole life of an accepted turn.
 * Called with the promise `runTurn` returns, in the SAME tick the route accepts
 * the turn — the gap between acceptance and the turn reaching the conversation
 * queue is exactly the window a `/clear` could otherwise slip through.
 *
 * `runTurn` settles rather than rejects (it surfaces its own failures as `error`
 * frames), so a rejection here is a runtime bug: the hold is released either way
 * — a conversation wedged against every future command would be far worse — and
 * the reason is named in the log rather than swallowed.
 */
export function holdConversationTurn(id: string, turn: Promise<void>): void {
  heldTurns.set(id, (heldTurns.get(id) ?? 0) + 1);
  const release = () => {
    const held = (heldTurns.get(id) ?? 1) - 1;
    held > 0 ? heldTurns.set(id, held) : heldTurns.delete(id);
  };
  turn.then(release, (err) => {
    release();
    console.warn(
      `[conversation-command] turn for ${id} rejected instead of settling:`,
      errMessage(err),
    );
  });
}

/**
 * Mark a command in flight for this conversation and return its release. Called
 * synchronously by `runConversationCommand`, before it awaits anything, so the
 * route's acceptance and this mark land in one tick.
 */
export function beginConversationCommand(id: string): () => void {
  commandsInFlight.add(id);
  return () => commandsInFlight.delete(id);
}

/**
 * Whether a command is working on this conversation right now. A turn arriving
 * here waits for a client retry rather than being accepted into a context that
 * is about to be reset under it.
 */
export function conversationCommandInFlight(id: string): boolean {
  return commandsInFlight.has(id);
}

/**
 * Whether a command must be refused right now — the mirror of the above, plus
 * the same posture the edit-and-resend rewind takes (`truncate-turn.ts`):
 * neither may rewrite a conversation's context behind a turn that is accepted,
 * queued, or executing on it.
 */
export function conversationCommandBusy(id: string): boolean {
  return (
    commandsInFlight.has(id) ||
    heldTurns.has(id) ||
    isTurnRunning(id) ||
    (conversations.get(id)?.pending ?? 0) > 0
  );
}

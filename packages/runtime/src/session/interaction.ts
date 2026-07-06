import { AsyncLocalStorage } from "node:async_hooks";
import type { PendingInteraction } from "@houston/runtime-client";

/**
 * The one thing THIS turn ended up waiting on the user for: recorded when the
 * model calls `ask_user` / `request_connection`, read after the turn's
 * `prompt()` resolves, and attached to the terminal clean `done` frame so the
 * board card can settle to `needs_you`.
 *
 * Turn-scoping mechanism (mirrors acting-context.ts): an `AsyncLocalStorage`
 * whose store — a fresh mutable holder — is established for the DURATION of
 * `session.prompt()`. The tool `execute` callbacks run inside that same async
 * subtree, so `recordPendingInteraction` writes into THIS turn's holder with no
 * process-global mutation. A brand-new holder every turn IS the reset: nothing
 * from a prior turn can leak, and two conversations running concurrently in one
 * runtime never cross-contaminate. Outside a turn (e.g. a unit test calling a
 * tool directly) the store is undefined, so recording is a silent no-op.
 */
export interface InteractionHolder {
  /** The last interaction recorded this turn (LAST call wins), else undefined. */
  pending: PendingInteraction | undefined;
}

const store = new AsyncLocalStorage<InteractionHolder>();

/** A fresh, empty holder for a new turn. */
export function newInteractionHolder(): InteractionHolder {
  return { pending: undefined };
}

/** Run `fn` with `holder` as the ambient interaction holder for its async subtree. */
export function runWithInteractionCapture<T>(
  holder: InteractionHolder,
  fn: () => T,
): T {
  return store.run(holder, fn);
}

/**
 * Record what the model is now waiting on the user for. LAST call wins — a model
 * that asks twice in one turn settles on its final ask. A no-op outside a turn.
 */
export function recordPendingInteraction(pending: PendingInteraction): void {
  const holder = store.getStore();
  if (holder) holder.pending = pending;
}

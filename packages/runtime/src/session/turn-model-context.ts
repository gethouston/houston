import { AsyncLocalStorage } from "node:async_hooks";

/**
 * WHICH provider/model the current turn RESOLVED onto, made available to the
 * tools while the turn runs.
 *
 * WHY it exists (PRODUCT-1244): `start_mission` fires a child turn, and a child
 * with no provider pin is refused on deployments where the runtime holds no
 * standing provider (managed cloud serves the credential per turn, injected by
 * the gateway on USER sends — a host-fired child gets no such injection; the
 * routine firer avoids this only because a routine always carries its own pin).
 * The parent turn is running RIGHT NOW on a provider that works, so its
 * resolved pair is the correct default pin for the child — which is also what
 * the tool promises the model ("omit to use the current one").
 *
 * Turn-scoping mechanism + assumption: identical to `conversation-context.ts` —
 * an `AsyncLocalStorage` established for the duration of `session.prompt()`
 * (exec-turn.ts), so concurrent conversations never read each other's model.
 */

export interface TurnModel {
  provider: string;
  model: string;
}

const store = new AsyncLocalStorage<TurnModel>();

/** Run `fn` with the turn's resolved provider/model as ambient context. */
export function runWithTurnModel<T>(
  turnModel: TurnModel | undefined,
  fn: () => T,
): T {
  if (!turnModel) return fn();
  return store.run(turnModel, fn);
}

/** The current turn's resolved provider/model, or undefined outside a turn. */
export function currentTurnModel(): TurnModel | undefined {
  return store.getStore();
}

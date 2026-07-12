import { AsyncLocalStorage } from "node:async_hooks";
import type { TurnMode } from "@houston/protocol";

/**
 * The execution mode THIS turn is running in ("execute" / "plan" / "auto"),
 * captured from the per-turn pin and made available to the integration tools
 * while the turn runs. The one consumer today: the integration `execute` proxy,
 * which forwards `x-houston-turn-mode: auto` on `/sandbox/integrations/execute`
 * ONLY on an Autopilot turn, so the host's action-approval gate lets an auto
 * turn act un-gated while a normal turn is gated.
 *
 * Turn-scoping mechanism + assumption: an `AsyncLocalStorage` whose store is
 * established for the DURATION of `session.prompt()` (see exec-turn.ts). The
 * tool `execute` callbacks run inside that same async context, so they read the
 * correct value with NO process-global mutation — this stays race-free even
 * when two conversations run concurrently in one runtime (a plain module-level
 * "current mode" would leak across them). Outside a turn (e.g. unit tests
 * calling a tool directly) the store is undefined, so no header is attached and
 * behavior is unchanged.
 */

const store = new AsyncLocalStorage<TurnMode>();

/** Run `fn` with `mode` as the ambient turn mode for its whole async subtree. */
export function runWithTurnMode<T>(mode: TurnMode, fn: () => T): T {
  return store.run(mode, fn);
}

/** The current turn's execution mode, or undefined outside a turn. */
export function currentTurnMode(): TurnMode | undefined {
  return store.getStore();
}

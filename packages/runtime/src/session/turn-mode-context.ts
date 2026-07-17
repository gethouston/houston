import { AsyncLocalStorage } from "node:async_hooks";
import type { TurnMode } from "@houston/protocol";

/**
 * The execution mode THIS turn is running in ("execute" / "plan" / "auto"),
 * captured from the per-turn pin and made available to the tools while the turn
 * runs. Consumers: the integration `execute` proxy (forwards
 * `x-houston-turn-mode: auto` so the host's action-approval gate lets an auto
 * turn act un-gated) and the live mode gates in the mutating/blocking tools
 * (clamped-fs write/edit, run_code, ask_user, …).
 *
 * The store holds a MUTABLE ref, not a value: the user can switch the Mode
 * pill WHILE the agent works (`POST /conversations/:id/mode`), and the running
 * turn adopts the new mode at its next tool decision — Claude Code's
 * shift+tab semantics. exec-turn.ts creates one ref per turn, parks it on the
 * Conversation record so the route can reach it, and establishes it here for
 * the DURATION of `session.prompt()`.
 *
 * Turn-scoping mechanism + assumption: an `AsyncLocalStorage` whose store is
 * established for the duration of the prompt (see exec-turn.ts). The tool
 * `execute` callbacks run inside that same async context, so they read the
 * correct ref with NO process-global mutation — this stays race-free even
 * when two conversations run concurrently in one runtime (a plain module-level
 * "current mode" would leak across them). Outside a turn (e.g. unit tests
 * calling a tool directly) the store is undefined, so no gate fires and
 * behavior is unchanged.
 */

/** One turn's live mode. `current` is mutated by a mid-turn Mode-pill switch. */
export interface TurnModeRef {
  current: TurnMode;
}

const store = new AsyncLocalStorage<TurnModeRef>();

/** Run `fn` with `ref` as the ambient turn-mode ref for its whole async subtree. */
export function runWithTurnMode<T>(ref: TurnModeRef, fn: () => T): T {
  return store.run(ref, fn);
}

/** The current turn's LIVE execution mode, or undefined outside a turn. Reads
 *  the ref at call time, so a mid-turn switch is visible immediately. */
export function currentTurnMode(): TurnMode | undefined {
  return store.getStore()?.current;
}

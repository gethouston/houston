import { AsyncLocalStorage } from "node:async_hooks";

/**
 * WHO the current turn is acting as (C2), captured from the host→runtime message
 * request and made available to the integration tools while the turn runs.
 *
 *  - `actingAs`:   the gateway's per-turn acting-as token (a live user drove the
 *                  turn) — forwarded verbatim on `/sandbox/integrations/*`.
 *  - `actingUser`: a routine creator's Supabase `sub` (a fired routine) —
 *                  forwarded so the host pairs it with the pod token upstream.
 *
 * Turn-scoping mechanism + assumption: an `AsyncLocalStorage` whose store is
 * established for the DURATION of `session.prompt()` (see chat.ts `execTurn`).
 * The tool `execute` callbacks run inside that same async context, so they read
 * the correct value with NO process-global mutation — this stays race-free even
 * when two conversations run concurrently in one runtime (a plain module-level
 * "current acting-as" would leak across them). Outside a turn (e.g. unit tests
 * calling a tool directly) the store is undefined, so no header is attached and
 * behavior is unchanged.
 */
export interface ActingContext {
  actingAs?: string;
  actingUser?: string;
}

const store = new AsyncLocalStorage<ActingContext>();

/** Run `fn` with `ctx` as the ambient acting context for its whole async subtree. */
export function runWithActingContext<T>(
  ctx: ActingContext | undefined,
  fn: () => T,
): T {
  // No identity to carry (local single-user, or neither header present): run
  // plainly so the tools see `undefined` and attach nothing.
  if (!ctx || (!ctx.actingAs && !ctx.actingUser)) return fn();
  return store.run(ctx, fn);
}

/** The current turn's acting context, or undefined outside a turn. */
export function currentActingContext(): ActingContext | undefined {
  return store.getStore();
}

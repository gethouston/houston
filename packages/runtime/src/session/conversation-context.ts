import { AsyncLocalStorage } from "node:async_hooks";

/**
 * WHICH conversation the current turn belongs to, made available to the tools
 * while the turn runs.
 *
 * WHY it exists: a tool that wants to link what it saves back to the mission the
 * user was in (learnings carry `mission_id` / `mission_title`) needs the turn's
 * conversation id, and pi hands a tool only its own parameters. Asking the MODEL
 * for the id would be unreliable (it can't see it) and forgeable; the runtime
 * knows it for free.
 *
 * Turn-scoping mechanism + assumption: identical to `acting-context.ts` — an
 * `AsyncLocalStorage` whose store is established for the DURATION of
 * `session.prompt()` (see exec-turn.ts). Tool `execute` callbacks run inside
 * that same async subtree, so two conversations running concurrently in one
 * runtime never read each other's id (a module-level "current conversation"
 * would leak across them). Outside a turn the store is undefined, so tools
 * attach nothing and behavior is unchanged.
 */

const store = new AsyncLocalStorage<string>();

/** Run `fn` with `id` as the ambient conversation id for its whole async subtree. */
export function runWithConversationId<T>(
  id: string | undefined,
  fn: () => T,
): T {
  // No id to carry: run plainly so tools see `undefined` and attach nothing.
  if (!id) return fn();
  return store.run(id, fn);
}

/** The current turn's conversation id, or undefined outside a turn. */
export function currentConversationId(): string | undefined {
  return store.getStore();
}

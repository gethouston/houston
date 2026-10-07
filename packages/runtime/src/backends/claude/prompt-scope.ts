import { AsyncResource } from "node:async_hooks";
import type {
  HookCallbackMatcher,
  HookEvent,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Where Houston's SDK callbacks run (canUseTool, hooks, the in-process MCP
 * tool handlers). The SDK dispatches them from a stream reader it starts when
 * the CLI process is spawned, so they inherit the async context of the SPAWN.
 * A cold `query()` spawns inside `session.prompt()`, under the turn's
 * AsyncLocalStorage stores (acting context, interaction capture, turn mode,
 * used-token capture): every tool sees them. A process started ahead of the
 * prompt (`./session-warm.ts`) was spawned outside them, so while the prompt
 * that claimed it runs, each bound callback re-enters the prompt's own
 * context instead. Outside such a prompt a bound callback runs as it was
 * called, exactly as an unbound one.
 */
export interface PromptScope {
  bind<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  /** Run bound callbacks in the caller's async context until released. */
  enter(): () => void;
}

export function createPromptScope(): PromptScope {
  let current: AsyncResource | undefined;
  return {
    bind:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        const scope = current;
        return scope
          ? scope.runInAsyncScope(fn, undefined, ...args)
          : fn(...args);
      },
    enter() {
      // An AsyncResource made here carries every AsyncLocalStorage store
      // active at this call into each runInAsyncScope.
      const scope = new AsyncResource("houston.claude-prompt");
      current = scope;
      return () => {
        if (current === scope) current = undefined;
        scope.emitDestroy();
      };
    },
  };
}

type SdkHooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

/** The same hooks, each callback bound to the prompt scope. */
export function bindHooks(hooks: SdkHooks, scope: PromptScope): SdkHooks {
  const bound: SdkHooks = {};
  for (const [event, matchers] of Object.entries(hooks) as Array<
    [HookEvent, HookCallbackMatcher[]]
  >) {
    if (!matchers) continue;
    bound[event] = matchers.map((matcher) => ({
      ...matcher,
      hooks: matcher.hooks.map((hook) => scope.bind(hook)),
    }));
  }
  return bound;
}

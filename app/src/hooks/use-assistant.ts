import { useQuery } from "@tanstack/react-query";
import {
  assistantDiscoveryRetryDelayMs,
  isAssistantUnavailableError,
  shouldRetryAssistantDiscovery,
} from "../lib/assistant-availability.ts";
import {
  type AssistantDiscovery,
  assistantDiscoveryState,
} from "../lib/assistant-discovery-state.ts";
import { newEngineActive } from "../lib/engine.ts";
import { queryKeys } from "../lib/query-keys.ts";
import {
  type AssistantHandle,
  surfaceEngineError,
  tauriAssistant,
} from "../lib/tauri.ts";

export type { AssistantDiscovery } from "../lib/assistant-discovery-state.ts";

/**
 * Ask for the assistant's address, retrying on the budget the failure earns.
 *
 * The ladder lives HERE and not in the query's `retry` option because `call()`
 * in lib/tauri.ts logs, toasts and Sentry-captures every rejection it sees: a
 * query-level retry turned ONE waking pod into a stack of toasts and a Sentry
 * event per attempt. Every attempt runs silent (`surface: false` — still
 * logged) and the FINAL error is surfaced once, by hand, down the same path
 * `call()` would have used. Same discipline as the cross-agent sweep
 * (`hooks/queries/all-conversations-sweep.ts`).
 */
async function discoverAssistant(): Promise<AssistantHandle> {
  for (let failures = 0; ; failures += 1) {
    try {
      return await tauriAssistant.discover({ surface: false });
    } catch (err) {
      if (!shouldRetryAssistantDiscovery(failures, err)) {
        // The same silence the single-call path used: a deployment with no
        // assistant and a pod that is merely waking are both expected states of
        // a healthy install, so they are logged and never reported.
        await surfaceEngineError("get_assistant", err, undefined, {
          silence: isAssistantUnavailableError,
        });
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, assistantDiscoveryRetryDelayMs(failures, err)),
      );
    }
  }
}

/**
 * Discover the user's personal assistant.
 *
 * The assistant is an ordinary agent conversation, so this address is the ONLY
 * thing the app cannot work out for itself; every call the chat then makes is
 * the existing per-agent surface. Discovery is lazy on the host (it materializes
 * the hidden agent on first ask) and idempotent, so asking once at boot is both
 * cheap and what makes the rail row honest.
 *
 * Three answers, read by `classifyAssistantDiscoveryFailure`:
 *
 *  - **No assistant here** — a deployment whose host does not implement
 *    discovery (a gateway fronts it, or it holds no agent tree), a gateway that
 *    predates the route, or one with no assistant credential bound. That is
 *    feature ABSENCE: it settles hidden and is never asked again.
 *  - **Not yet** — the gateway's answer while an engine pod provisions, wakes
 *    or is replaced. Recoverable, so it is retried with backoff (honouring a
 *    retry hint the failure advertises) and, once the budget is spent, left in
 *    a state TanStack refetches on the next mount, window focus or reconnect.
 *    The rail row comes back on its own; nothing asks the user to reload.
 *  - **Anything else** — a real failure, kept on the loud path (the user sees
 *    nothing; the log and Sentry get it) with one blind retry so a gateway
 *    handoff does not cost a session's assistant.
 *
 * `staleTime` is infinite for the SUCCESS case only: an address does not
 * change under us. A query holding no data is stale whatever that value says,
 * which is exactly what makes an unanswered discovery keep trying.
 */
export function useAssistant(): AssistantDiscovery {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: queryKeys.assistant(),
    queryFn: discoverAssistant,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    // No `retry` here on purpose: the bounded, reason-aware ladder is inside
    // `discoverAssistant`, where the intermediate attempts stay silent.
    retry: false,
  });

  return assistantDiscoveryState({
    enabled,
    handle: query.data ?? null,
    isError: query.isError,
    isFetching: query.isFetching,
  });
}

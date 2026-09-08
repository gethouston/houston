import { useQuery } from "@tanstack/react-query";
import {
  assistantDiscoveryRetryDelayMs,
  shouldRetryAssistantDiscovery,
} from "../lib/assistant-availability.ts";
import { newEngineActive } from "../lib/engine.ts";
import { queryKeys } from "../lib/query-keys.ts";
import { type AssistantHandle, tauriAssistant } from "../lib/tauri.ts";

/** Where the personal assistant lives, and whether it exists here at all. */
export interface AssistantDiscovery {
  /** The address to open the chat at, or null while unknown / unavailable. */
  handle: AssistantHandle | null;
  /** True while discovery is still deciding. Gates never act on this. */
  isLoading: boolean;
  /**
   * Discovery has settled without an address. The sidebar entry and the screen
   * do not exist — a silent answer, never an error the user is shown.
   */
  unavailable: boolean;
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
 *  - **No assistant here** — a deployment whose host fronts discovery to the
 *    gateway, holds no agent tree, or has no assistant credential bound. That
 *    is feature ABSENCE: it settles hidden and is never asked again.
 *  - **Not yet** — the gateway's answer while an engine pod provisions, wakes
 *    or is replaced. Recoverable, so it is retried with backoff (honouring a
 *    retry hint the failure advertises) and, once the budget is spent, left in
 *    a state TanStack refetches on the next mount, window focus or reconnect.
 *    The rail row comes back on its own; nothing asks the user to reload.
 *  - **Anything else** — a real failure, kept on the loud path
 *    (`tauriAssistant.discover` logs + reports it; the user sees nothing) with
 *    one blind retry so a gateway handoff does not cost a session's assistant.
 *
 * `staleTime` is infinite for the SUCCESS case only: an address does not
 * change under us. A query holding no data is stale whatever that value says,
 * which is exactly what makes an unanswered discovery keep trying.
 */
export function useAssistant(): AssistantDiscovery {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: queryKeys.assistant(),
    queryFn: () => tauriAssistant.discover(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: shouldRetryAssistantDiscovery,
    retryDelay: assistantDiscoveryRetryDelayMs,
  });

  return {
    handle: query.data ?? null,
    isLoading: enabled && query.isLoading,
    // Any settled failure hides the entry: an assistant we cannot address is
    // one the user cannot open, and a rail row that opens a broken screen is
    // worse than no row. Hidden is a verdict on THIS attempt, not on the
    // session — a later refetch that answers puts the row back.
    unavailable: !enabled || (query.isError && !query.isLoading),
  };
}

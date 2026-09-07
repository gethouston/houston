import { useQuery } from "@tanstack/react-query";
import { isAssistantUnavailableError } from "../lib/assistant-availability.ts";
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
   * The deployment serves no assistant (501 gateway-only, 503 no agent tree).
   * The sidebar entry and the screen do not exist — a settled, silent answer,
   * never an error the user is shown.
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
 * A deployment with no assistant answers 501/503, which is feature ABSENCE, not
 * failure: it settles as `unavailable` and is never retried. Any other failure
 * keeps the loud path (`tauriAssistant.discover` logs + reports it; the user
 * sees nothing) and is retried a couple of times so a transient blip does not
 * cost the user their assistant for the session.
 */
export function useAssistant(): AssistantDiscovery {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: queryKeys.assistant(),
    queryFn: () => tauriAssistant.discover(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: (failureCount, error) =>
      !isAssistantUnavailableError(error) && failureCount < 2,
  });

  return {
    handle: query.data ?? null,
    isLoading: enabled && query.isLoading,
    // Any settled failure hides the entry: an assistant we cannot address is
    // one the user cannot open, and a rail row that opens a broken screen is
    // worse than no row. The 501/503 case is merely the expected one.
    unavailable: !enabled || (query.isError && !query.isLoading),
  };
}

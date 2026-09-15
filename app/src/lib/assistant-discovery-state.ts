// What a discovery QUERY's state means to the surfaces that read it — the
// sibling of `assistant-availability.ts`, which reads a discovery FAILURE.
//
// Only sibling-module and type imports, so node runs it as it stands — the reason
// app/tests/assistant-discovery-state.test.ts exercises it under the app's
// node:test runner with no bundler — and it cannot drift from the rail row,
// the screen and the view guard, which all read the same four answers.

import type { AssistantHandle } from "@houston-ai/engine-client";
import { classifyAssistantDiscoveryFailure } from "./assistant-availability.ts";

/**
 * What the screen must SAY when discovery has no address to hand over and the
 * deployment does serve an assistant. Both wear the same honest, non-technical
 * copy and the same retry action: the user can act on neither cause, and an
 * `unexpected` one has already reached Sentry, so putting its shape on screen
 * would only trade a blank for a stack trace.
 */
export type AssistantFailure = "transient" | "unexpected";

/** Where the personal assistant lives, and whether it exists here at all. */
export interface AssistantDiscovery {
  /** The address to open the chat at, or null while unknown / unavailable. */
  handle: AssistantHandle | null;
  /**
   * Discovery has no address YET, but the question is still open. Everything
   * that would show the assistant waits on this: the screen shows its calm
   * starting state, and the surface gates stay unready.
   */
  isLoading: boolean;
  /**
   * This deployment serves NO assistant. The sidebar entry and the screen do
   * not exist — a silent answer, never an error the user is shown.
   */
  unavailable: boolean;
  /**
   * Discovery's retry ladder is spent and Houston still has no address, on a
   * deployment that does have an assistant. Null while the ladder runs, after
   * a success, and on a deployment that serves none — so a non-null value is
   * exactly "show the user the honest state and a way to ask again".
   */
  failure: AssistantFailure | null;
}

/** The query facts this reading is made of. */
export interface AssistantQueryState {
  /** Whether discovery runs on this engine at all. */
  enabled: boolean;
  /** The address the query holds, including one kept across a failed refetch. */
  handle: AssistantHandle | null;
  /**
   * The failure the query holds, or null when it is not in its error state.
   * TanStack keeps it across a refetch that is still in flight and clears it
   * on the next success, which is precisely the lifetime the honest state
   * wants: it appears when the ladder gives up and stays put through the 60s
   * background beat instead of flickering back to the spinner once a minute.
   */
  error: unknown;
}

/**
 * Read a discovery query.
 *
 * Loading is the absence of BOTH an address and a failure, not TanStack's
 * `isLoading` (= `isPending && isFetching`). On a device with no network the
 * default `networkMode: "online"` PAUSES the query: pending, not fetching, not
 * errored — so `isLoading` reads false while nothing has been asked and nothing
 * has answered. Trusting it rendered the rail row and opened a pane with no
 * handle, no spinner and no error: a blank screen. The same absence also covers
 * the retry ladder, which runs INSIDE the query function and surfaces nothing
 * until it is spent.
 *
 * A held address outranks a failure: the address does not change under us, so a
 * refetch that fails is not a deployment that lost its assistant.
 *
 * Only `unsupported` takes the assistant away. A pod that will not come up is a
 * deployment that HAS an assistant and cannot start it, so the rail row stays
 * and the screen says so — hiding it left the user with nowhere to ask again
 * (PRODUCT-1795).
 */
export function assistantDiscoveryState(
  state: AssistantQueryState,
): AssistantDiscovery {
  const { enabled, handle, error } = state;
  if (!enabled)
    return { handle: null, isLoading: false, unavailable: true, failure: null };
  if (handle)
    return { handle, isLoading: false, unavailable: false, failure: null };
  if (!error)
    return { handle: null, isLoading: true, unavailable: false, failure: null };
  const { kind } = classifyAssistantDiscoveryFailure(error);
  const unavailable = kind === "unsupported";
  return {
    handle: null,
    isLoading: false,
    unavailable,
    failure: unavailable ? null : kind,
  };
}

// What a discovery QUERY's state means to the surfaces that read it — the
// sibling of `assistant-availability.ts`, which reads a discovery FAILURE.
//
// Dependency-free so it is node-testable directly
// (app/tests/assistant-discovery-state.test.ts) and cannot drift from the rail
// row, the screen and the view guard, which all read the same three answers.

import type { AssistantHandle } from "@houston-ai/engine-client";

/** Where the personal assistant lives, and whether it exists here at all. */
export interface AssistantDiscovery {
  /** The address to open the chat at, or null while unknown / unavailable. */
  handle: AssistantHandle | null;
  /**
   * Discovery has no address YET, but the question is still open. Everything
   * that would show the assistant waits on this: the rail row stays hidden, the
   * screen shows its spinner, and the surface gates stay unready.
   */
  isLoading: boolean;
  /**
   * Discovery has SETTLED without an address. The sidebar entry and the screen
   * do not exist — a silent answer, never an error the user is shown.
   */
  unavailable: boolean;
}

/** The query facts this reading is made of. */
export interface AssistantQueryState {
  /** Whether discovery runs on this engine at all. */
  enabled: boolean;
  /** The address the query holds, including one kept across a failed refetch. */
  handle: AssistantHandle | null;
  isError: boolean;
  isFetching: boolean;
}

/**
 * Read a discovery query.
 *
 * Loading is derived from the ABSENCE OF AN ANSWER, not from TanStack's
 * `isLoading` (= `isPending && isFetching`). On a device with no network the
 * default `networkMode: "online"` PAUSES the query: pending, not fetching, not
 * errored — so `isLoading` reads false while nothing has been asked and nothing
 * has answered. Trusting it rendered the rail row and opened a pane with no
 * handle, no spinner and no error: a blank screen.
 *
 * Absence is a verdict on a SETTLED query. An errored query that is being
 * refetched (window focus, reconnect) still reads `status: "error"` until it
 * resolves, and calling that unavailable while the gates went ready is what
 * bounced a user out of the assistant screen mid-repair. A held address also
 * survives a failed revalidation: the address does not change under us, so a
 * refetch that fails is not a deployment that lost its assistant.
 */
export function assistantDiscoveryState(
  state: AssistantQueryState,
): AssistantDiscovery {
  const { enabled, handle, isError, isFetching } = state;
  const settledWithoutHandle = !handle && isError && !isFetching;
  return {
    handle: enabled ? handle : null,
    isLoading: enabled && !handle && !settledWithoutHandle,
    unavailable: !enabled || settledWithoutHandle,
  };
}

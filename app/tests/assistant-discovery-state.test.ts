import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantDiscoveryState } from "../src/lib/assistant-discovery-state.ts";

/** The four inputs, defaulted to the healthy in-flight case. */
const state = (over: Partial<Parameters<typeof assistantDiscoveryState>[0]>) =>
  assistantDiscoveryState({
    enabled: true,
    handle: null,
    isError: false,
    isFetching: true,
    ...over,
  });

const HANDLE = { agent: "ws/.assistant", conversation: "assistant" };

describe("assistantDiscoveryState", () => {
  it("is loading while the answer is still on the way", () => {
    assert.deepEqual(state({}), {
      handle: null,
      isLoading: true,
      unavailable: false,
    });
  });

  it("stays LOADING on an offline device, where nothing is in flight at all", () => {
    // TanStack's default `networkMode: "online"` PAUSES an offline query:
    // status `pending`, fetchStatus `paused`, so `isLoading` (= isPending &&
    // isFetching) is false while `isError` is false too. Read as "settled", the
    // rail row rendered and opened a blank pane — no handle, no spinner, no
    // error, nothing at all on screen.
    assert.deepEqual(state({ isFetching: false }), {
      handle: null,
      isLoading: true,
      unavailable: false,
    });
  });

  it("answers with the address once discovery succeeds", () => {
    assert.deepEqual(state({ handle: HANDLE, isFetching: false }), {
      handle: HANDLE,
      isLoading: false,
      unavailable: false,
    });
  });

  it("is unavailable once discovery has SETTLED without an address", () => {
    assert.deepEqual(state({ isError: true, isFetching: false }), {
      handle: null,
      isLoading: false,
      unavailable: true,
    });
  });

  it("holds the gate while an errored query is being refetched", () => {
    // A focus/reconnect refetch keeps `status: "error"` until it resolves. With
    // the error alone deciding, `unavailable` stayed true while `ready` went
    // true, and the view guard bounced the user out of the assistant screen
    // mid-repair.
    assert.deepEqual(state({ isError: true, isFetching: true }), {
      handle: null,
      isLoading: true,
      unavailable: false,
    });
  });

  it("keeps a known address when a later refetch fails", () => {
    // The address does not change under us: a failed revalidation of a handle
    // we already hold is not a deployment that lost its assistant.
    assert.deepEqual(
      state({ handle: HANDLE, isError: true, isFetching: false }),
      { handle: HANDLE, isLoading: false, unavailable: false },
    );
  });

  it("is unavailable, never loading, on an engine that is not active", () => {
    for (const isFetching of [true, false]) {
      assert.deepEqual(
        state({ enabled: false, isFetching }),
        { handle: null, isLoading: false, unavailable: true },
        `isFetching ${isFetching}`,
      );
    }
  });
});

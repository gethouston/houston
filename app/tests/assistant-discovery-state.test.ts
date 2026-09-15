import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantDiscoveryState } from "../src/lib/assistant-discovery-state.ts";

/** The three inputs, defaulted to the healthy in-flight case. */
const state = (over: Partial<Parameters<typeof assistantDiscoveryState>[0]>) =>
  assistantDiscoveryState({
    enabled: true,
    handle: null,
    error: null,
    ...over,
  });

const HANDLE = { agent: "ws/.assistant", conversation: "assistant" };
/** The gateway's "engine unavailable": a 503 with no code, plus its hint. */
const WAKING = { status: 503, body: {}, retryAfterMs: 2_000 };
/** A deployment that serves no assistant at all. */
const ABSENT = { status: 501, body: { code: "assistant_gateway_only" } };
/** A real failure: no status the classifier believes anything about. */
const BROKEN = { status: 500, body: {} };

describe("assistantDiscoveryState", () => {
  it("is loading while the ladder is still running", () => {
    // The ladder lives INSIDE the query function, so it surfaces no error
    // until it is spent: an unanswered query is simply one with no error yet.
    assert.deepEqual(state({}), {
      handle: null,
      isLoading: true,
      unavailable: false,
      failure: null,
    });
  });

  it("stays LOADING on an offline device, where nothing is in flight at all", () => {
    // TanStack's default `networkMode: "online"` PAUSES an offline query:
    // status `pending`, fetchStatus `paused`, so `isLoading` (= isPending &&
    // isFetching) is false while no error has been recorded either. Read as
    // "settled", the rail row rendered and opened a blank pane — no handle, no
    // spinner, no error, nothing at all on screen.
    assert.deepEqual(state({ error: null }), {
      handle: null,
      isLoading: true,
      unavailable: false,
      failure: null,
    });
  });

  it("answers with the address once discovery succeeds", () => {
    assert.deepEqual(state({ handle: HANDLE }), {
      handle: HANDLE,
      isLoading: false,
      unavailable: false,
      failure: null,
    });
  });

  it("clears the failure when a later attempt succeeds", () => {
    // TanStack drops the error on success, so the screen leaves the honest
    // state the moment an address arrives — including the one the user's own
    // "Try again" fetched.
    assert.deepEqual(state({ handle: HANDLE, error: null }), {
      handle: HANDLE,
      isLoading: false,
      unavailable: false,
      failure: null,
    });
  });

  it("reports a spent TRANSIENT ladder as a failure, never as unavailable", () => {
    // A pod that will not wake is a deployment that HAS an assistant and
    // cannot start it. Calling that unavailable took the rail row down and
    // left the user with nothing to click until the next app launch
    // (PRODUCT-1795).
    assert.deepEqual(state({ error: WAKING }), {
      handle: null,
      isLoading: false,
      unavailable: false,
      failure: "transient",
    });
  });

  it("reports an UNEXPECTED failure the same way, for the same reason", () => {
    // Already reported to Sentry. The user gets the honest state and the retry,
    // never the failure's shape.
    assert.deepEqual(state({ error: BROKEN }), {
      handle: null,
      isLoading: false,
      unavailable: false,
      failure: "unexpected",
    });
  });

  it("is unavailable, and silent, where the deployment serves no assistant", () => {
    assert.deepEqual(state({ error: ABSENT }), {
      handle: null,
      isLoading: false,
      unavailable: true,
      failure: null,
    });
  });

  it("keeps a known address when a later refetch fails", () => {
    // The address does not change under us: a failed revalidation of a handle
    // we already hold is not a deployment that lost its assistant, and the chat
    // must not be replaced by an error screen behind the user's back.
    for (const error of [WAKING, ABSENT, BROKEN]) {
      assert.deepEqual(
        state({ handle: HANDLE, error }),
        {
          handle: HANDLE,
          isLoading: false,
          unavailable: false,
          failure: null,
        },
        `status ${error.status}`,
      );
    }
  });

  it("is unavailable, never loading, on an engine that is not active", () => {
    for (const error of [null, WAKING]) {
      assert.deepEqual(
        state({ enabled: false, error }),
        {
          handle: null,
          isLoading: false,
          unavailable: true,
          failure: null,
        },
        `error ${JSON.stringify(error)}`,
      );
    }
  });
});

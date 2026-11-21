import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantDiscoveryState } from "../src/lib/assistant-discovery-state.ts";

const state = (over: Partial<Parameters<typeof assistantDiscoveryState>[0]>) =>
  assistantDiscoveryState({
    enabled: true,
    handle: null,
    error: null,
    ...over,
  });

const HANDLE = { agent: "ws/.assistant", conversation: "assistant" };
const WAKING = { status: 503, body: {}, retryAfterMs: 2_000 };
const ABSENT = { status: 501, body: { code: "assistant_gateway_only" } };
const BROKEN = { status: 500, body: {} };

describe("assistantDiscoveryState", () => {
  it("is loading while the ladder is still running", () => {
    assert.deepEqual(state({}), {
      handle: null,
      isLoading: true,
      unavailable: false,
      failure: null,
    });
  });

  it("stays LOADING on an offline device, where nothing is in flight at all", () => {
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
    assert.deepEqual(state({ handle: HANDLE, error: null }), {
      handle: HANDLE,
      isLoading: false,
      unavailable: false,
      failure: null,
    });
  });

  it("reports a spent TRANSIENT ladder as a failure, never as unavailable", () => {
    assert.deepEqual(state({ error: WAKING }), {
      handle: null,
      isLoading: false,
      unavailable: false,
      failure: "transient",
    });
  });

  it("reports an UNEXPECTED failure the same way, for the same reason", () => {
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSISTANT_GATEWAY_ONLY,
  ASSISTANT_UNAVAILABLE,
  isAssistantUnavailableError,
} from "../src/lib/assistant-availability.ts";

describe("isAssistantUnavailableError", () => {
  it("matches the gateway-fronted 501 (discovery belongs to the gateway)", () => {
    // Structural shape of HoustonEngineError(501, host body) as the web
    // adapter's assistant mixin throws it: the host's flat `{error, code}`.
    const err = Object.assign(new Error("Engine error 501"), {
      status: 501,
      body: {
        error: "the gateway serves assistant discovery, not this engine",
        code: ASSISTANT_GATEWAY_ONLY,
      },
    });
    assert.equal(isAssistantUnavailableError(err), true);
  });

  it("matches the no-agent-tree 503", () => {
    const err = Object.assign(new Error("Engine error 503"), {
      status: 503,
      body: { error: "no agent tree", code: ASSISTANT_UNAVAILABLE },
    });
    assert.equal(isAssistantUnavailableError(err), true);
  });

  it("matches whatever the engine-client's nested body shape carries", () => {
    // The other adapter wraps the body under `error`; only the status is the
    // same across both, which is exactly why the predicate reads the status.
    assert.equal(
      isAssistantUnavailableError({
        status: 501,
        body: { error: { message: "not implemented" } },
      }),
      true,
    );
  });

  it("never matches other statuses — a real failure must stay loud", () => {
    for (const status of [400, 401, 403, 404, 500, 502, 504]) {
      assert.equal(isAssistantUnavailableError({ status }), false);
    }
  });

  it("never matches non-errors or shapeless throws", () => {
    assert.equal(isAssistantUnavailableError(undefined), false);
    assert.equal(isAssistantUnavailableError(null), false);
    assert.equal(isAssistantUnavailableError("501"), false);
    assert.equal(isAssistantUnavailableError(new Error("boom")), false);
    assert.equal(isAssistantUnavailableError({ status: "501" }), false);
  });
});

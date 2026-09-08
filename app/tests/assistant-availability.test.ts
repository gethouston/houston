import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSISTANT_GATEWAY_ONLY,
  ASSISTANT_NOT_CONFIGURED,
  ASSISTANT_RETRY_MAX_DELAY_MS,
  ASSISTANT_RETRY_MIN_DELAY_MS,
  ASSISTANT_TRANSIENT_RETRY_LIMIT,
  ASSISTANT_UNAVAILABLE,
  ASSISTANT_UNEXPECTED_RETRY_LIMIT,
  assistantDiscoveryRetryDelayMs,
  classifyAssistantDiscoveryFailure,
  isAssistantUnavailableError,
  shouldRetryAssistantDiscovery,
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

describe("classifyAssistantDiscoveryFailure", () => {
  it("reads the gateway's waking 503 as TRANSIENT, and retries it", () => {
    // The gateway answers this while an engine pod is provisioning, waking or
    // being torn down (`cloud/internal/edge/agents/assistant.go`): no `code`,
    // a free-text `detail`. Classifying it as absence hides the assistant for
    // the rest of the session, and only an app reload brings it back.
    const err = Object.assign(new Error("engine unavailable"), {
      status: 503,
      body: { error: "engine unavailable", detail: "agent is waking" },
    });
    assert.deepEqual(classifyAssistantDiscoveryFailure(err), {
      kind: "transient",
      retryAfterMs: null,
    });
    assert.equal(shouldRetryAssistantDiscovery(1, err), true);
    assert.equal(shouldRetryAssistantDiscovery(2, err), true);
  });

  it("reads 501 as UNSUPPORTED and never retries it", () => {
    const err = {
      status: 501,
      body: {
        error: "the gateway serves assistant discovery, not this engine",
        code: ASSISTANT_GATEWAY_ONLY,
      },
    };
    assert.deepEqual(classifyAssistantDiscoveryFailure(err), {
      kind: "unsupported",
    });
    assert.equal(shouldRetryAssistantDiscovery(1, err), false);
  });

  it("reads every explicit absence code as UNSUPPORTED, in both body shapes", () => {
    for (const code of [
      ASSISTANT_GATEWAY_ONLY,
      ASSISTANT_UNAVAILABLE,
      ASSISTANT_NOT_CONFIGURED,
    ]) {
      // Flat: the host's own body, passed through by the web adapter.
      assert.deepEqual(
        classifyAssistantDiscoveryFailure({
          status: 503,
          body: { error: "no assistant here", code },
        }),
        { kind: "unsupported" },
        `flat ${code}`,
      );
      // Nested: the engine-client wraps the body under `error`.
      assert.deepEqual(
        classifyAssistantDiscoveryFailure({
          status: 503,
          body: { error: { message: "no assistant here", code } },
        }),
        { kind: "unsupported" },
        `nested ${code}`,
      );
      assert.equal(
        shouldRetryAssistantDiscovery(1, { status: 503, body: { code } }),
        false,
        `retry ${code}`,
      );
    }
  });

  it("reads a bare 503 as TRANSIENT — the body may carry nothing at all", () => {
    assert.deepEqual(classifyAssistantDiscoveryFailure({ status: 503 }), {
      kind: "transient",
      retryAfterMs: null,
    });
  });

  it("reads everything else as UNEXPECTED — the loud path", () => {
    for (const status of [400, 401, 403, 404, 500, 502, 504]) {
      assert.deepEqual(
        classifyAssistantDiscoveryFailure({ status }),
        { kind: "unexpected" },
        `status ${status}`,
      );
    }
  });

  it("reads non-errors and shapeless throws as UNEXPECTED", () => {
    for (const thrown of [undefined, null, "503", 503, new Error("boom")]) {
      assert.deepEqual(classifyAssistantDiscoveryFailure(thrown), {
        kind: "unexpected",
      });
    }
  });

  it("carries a retry hint the error advertises", () => {
    assert.deepEqual(
      classifyAssistantDiscoveryFailure({ status: 503, retryAfterMs: 2_000 }),
      { kind: "transient", retryAfterMs: 2_000 },
    );
    // Junk hints are dropped, not trusted into the backoff.
    for (const retryAfterMs of [0, -1, Number.NaN, "2000", null]) {
      assert.deepEqual(
        classifyAssistantDiscoveryFailure({ status: 503, retryAfterMs }),
        { kind: "transient", retryAfterMs: null },
        `hint ${String(retryAfterMs)}`,
      );
    }
  });
});

describe("assistant discovery retry policy", () => {
  it("gives a transient failure a bounded budget, a real failure one blind retry", () => {
    const transient = { status: 503 };
    for (let count = 1; count <= ASSISTANT_TRANSIENT_RETRY_LIMIT; count++) {
      assert.equal(shouldRetryAssistantDiscovery(count, transient), true);
    }
    assert.equal(
      shouldRetryAssistantDiscovery(
        ASSISTANT_TRANSIENT_RETRY_LIMIT + 1,
        transient,
      ),
      false,
    );

    const unexpected = { status: 500 };
    for (let count = 1; count <= ASSISTANT_UNEXPECTED_RETRY_LIMIT; count++) {
      assert.equal(shouldRetryAssistantDiscovery(count, unexpected), true);
    }
    assert.equal(
      shouldRetryAssistantDiscovery(
        ASSISTANT_UNEXPECTED_RETRY_LIMIT + 1,
        unexpected,
      ),
      false,
    );
  });

  it("backs off exponentially from 1s, capped", () => {
    const err = { status: 503 };
    assert.equal(assistantDiscoveryRetryDelayMs(0, err), 1_000);
    assert.equal(assistantDiscoveryRetryDelayMs(1, err), 2_000);
    assert.equal(assistantDiscoveryRetryDelayMs(2, err), 4_000);
    assert.equal(
      assistantDiscoveryRetryDelayMs(20, err),
      ASSISTANT_RETRY_MAX_DELAY_MS,
    );
  });

  it("honours a retry hint over the backoff, clamped to sane bounds", () => {
    assert.equal(
      assistantDiscoveryRetryDelayMs(3, { status: 503, retryAfterMs: 2_000 }),
      2_000,
    );
    assert.equal(
      assistantDiscoveryRetryDelayMs(0, { status: 503, retryAfterMs: 5 }),
      ASSISTANT_RETRY_MIN_DELAY_MS,
    );
    assert.equal(
      assistantDiscoveryRetryDelayMs(0, { status: 503, retryAfterMs: 600_000 }),
      ASSISTANT_RETRY_MAX_DELAY_MS,
    );
  });
});

describe("isAssistantUnavailableError stays the reporting-silence predicate", () => {
  it("silences absence AND a waking pod, never a real failure", () => {
    assert.equal(isAssistantUnavailableError({ status: 501 }), true);
    assert.equal(isAssistantUnavailableError({ status: 503 }), true);
    assert.equal(
      isAssistantUnavailableError({
        status: 503,
        body: { error: "engine unavailable", detail: "agent is waking" },
      }),
      true,
    );
    assert.equal(isAssistantUnavailableError({ status: 500 }), false);
  });
});

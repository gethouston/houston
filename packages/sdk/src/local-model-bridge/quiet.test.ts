import { expect, test } from "vitest";
import { NoAgentForProviderWriteError } from "../no-agent-provider-write-error";
import { BridgeDisposedError, BridgeStateError } from "./errors";
import { bridgeQuietClass } from "./quiet";

// PRODUCT-1833: the SDK names the expected bridge states once; a surface only
// binds the answer to its quiet report. Anything else stays a real failure.
test("names the three expected bridge states and nothing else", () => {
  expect(
    bridgeQuietClass(
      Object.assign(new Error("unsupported"), {
        status: 503,
        body: { code: "bridge_not_supported" },
      }),
    ),
  ).toBe("bridge_unsupported");
  expect(bridgeQuietClass(new NoAgentForProviderWriteError())).toBe(
    "bridge_no_agent",
  );
  for (const status of ["model_unavailable", "reconnecting"] as const)
    expect(bridgeQuietClass(new BridgeStateError(status))).toBe("bridge_state");
  expect(
    bridgeQuietClass(
      Object.assign(new Error("forbidden"), {
        status: 403,
        body: { code: "bridge_forbidden" },
      }),
    ),
  ).toBeNull();
  expect(bridgeQuietClass(new Error("BridgeStateError"))).toBeNull();
  // A cancellation is neither quiet nor loud: `isBridgeCancellation` drops it
  // before any report (HOUSTON-APP-5HX), so it must not borrow a class here.
  expect(
    bridgeQuietClass(new DOMException("aborted", "AbortError")),
  ).toBeNull();
  expect(bridgeQuietClass(new BridgeDisposedError())).toBeNull();
});

function gatewayError(status: number, code: string) {
  return Object.assign(new Error(`${code} (engine error ${status})`), {
    status,
    body: { code, error: code.replace(/_/g, " ") },
  });
}
// HOUSTON-APP-5DY / 5M1: the gateway's answers the SDK recovers from (a stale
// renewal opens a fresh session; a refused migration asks for a reconnect).
// HOUSTON-APP-5E4: the native bridge could not reach the gateway's relay, the
// plain strings `crates/local-model-bridge/src/types.rs` renders; the SDK
// retries on its reconnecting curve.
test("names the gateway and native retry states as bridge_state", () => {
  for (const error of [
    gatewayError(409, "stale_session"),
    gatewayError(409, "migration_requires_reconnect"),
    "Bridge connection failed",
    "Bridge operation timed out",
  ])
    expect(bridgeQuietClass(error)).toBe("bridge_state");
});
test("keeps unexpected gateway and native answers loud", () => {
  for (const error of [
    gatewayError(503, "bridge_unavailable"),
    gatewayError(409, "bridge_conflict"),
    gatewayError(400, "stale_session"),
    gatewayError(502, "bridge_request_failed"),
    Object.assign(new Error("engine error 409"), {
      status: 409,
      body: "<html>",
    }),
    "Invalid bridge protocol",
    "Bridge connection does not match registration",
    // The relay answered the handshake with a status: our side refused.
    "Bridge connection refused (401)",
    "Bridge connection refused (403)",
    "Bridge connection refused (502)",
    "Bridge connection refused (503)",
  ])
    expect(bridgeQuietClass(error)).toBeNull();
});

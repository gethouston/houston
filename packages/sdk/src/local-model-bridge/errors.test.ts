import { expect, test } from "vitest";
import {
  BridgeDisposedError,
  BridgeStateError,
  isAuthorizationFailure,
  isBridgeCancellation,
} from "./errors";

test("a bridge state error is named and keeps its state", () => {
  const error = new BridgeStateError("model_unavailable");
  expect(error.name).toBe("BridgeStateError");
  expect(error.status).toBe("model_unavailable");
  expect(error.message).toBe("model_unavailable");
  expect(isAuthorizationFailure(error)).toBe(false);
  expect(isAuthorizationFailure(new BridgeStateError("revoked"))).toBe(true);
});

test("a cancellation is an abort or a disposed controller, nothing else", () => {
  expect(
    isBridgeCancellation(
      new DOMException("The operation was aborted.", "AbortError"),
    ),
  ).toBe(true);
  expect(
    isBridgeCancellation(
      Object.assign(new Error("cancelled"), { name: "AbortError" }),
    ),
  ).toBe(true);
  expect(isBridgeCancellation(new BridgeDisposedError())).toBe(true);
  expect(isBridgeCancellation(new BridgeStateError("reconnecting"))).toBe(
    false,
  );
  expect(isBridgeCancellation({ status: 401 })).toBe(false);
  expect(isBridgeCancellation(new Error("Load failed"))).toBe(false);
  expect(new BridgeDisposedError().name).toBe("BridgeDisposedError");
});

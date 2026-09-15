import { expect, test } from "vitest";
import { BridgeStateError, isAuthorizationFailure } from "./errors";

// PRODUCT-1833: the app's quiet-class gate recognizes the SDK's retry states
// by name and `status` without importing this module.
test("a bridge state error is named and keeps its state", () => {
  const error = new BridgeStateError("model_unavailable");
  expect(error.name).toBe("BridgeStateError");
  expect(error.status).toBe("model_unavailable");
  expect(error.message).toBe("model_unavailable");
  expect(isAuthorizationFailure(error)).toBe(false);
  expect(isAuthorizationFailure(new BridgeStateError("revoked"))).toBe(true);
});

import { expect, test } from "vitest";
import { BridgeStateError, isAuthorizationFailure } from "./errors";

// PRODUCT-1833: erasable class (explicit field, named) so `quiet.ts` and the
// app's node:test runner can load it through a package subpath.
test("a bridge state error is named and keeps its state", () => {
  const error = new BridgeStateError("model_unavailable");
  expect(error.name).toBe("BridgeStateError");
  expect(error.status).toBe("model_unavailable");
  expect(error.message).toBe("model_unavailable");
  expect(isAuthorizationFailure(error)).toBe(false);
  expect(isAuthorizationFailure(new BridgeStateError("revoked"))).toBe(true);
});

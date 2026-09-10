import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isModelNotAllowedError } from "../src/lib/model-not-allowed.ts";

// Structural shape of HoustonEngineError(status, body): the classifier reads
// the body, so the fixtures carry just that (same approach as agent-gone.test).
const engineError = (status: number, body: unknown) =>
  Object.assign(new Error(`engine error ${status}`), { status, body });

describe("isModelNotAllowedError", () => {
  it("matches the gateway's FLAT model_not_allowed body (the shipped shape)", () => {
    // cloud `modelchoice.go` answers `{error: "<sentence>", code: "model_not_allowed"}`.
    strictEqual(
      isModelNotAllowedError(
        engineError(400, {
          error: "model not allowed for this agent",
          code: "model_not_allowed",
        }),
      ),
      true,
    );
  });

  it("matches the nested engine shape too", () => {
    strictEqual(
      isModelNotAllowedError(
        engineError(400, {
          error: { code: "model_not_allowed", message: "model not allowed" },
        }),
      ),
      true,
    );
  });

  it("does not match other 400s, transport errors, or bare strings", () => {
    strictEqual(
      isModelNotAllowedError(
        engineError(400, { error: "model must be a non-empty string" }),
      ),
      false,
    );
    strictEqual(
      isModelNotAllowedError(new TypeError("Failed to fetch")),
      false,
    );
    strictEqual(isModelNotAllowedError("model_not_allowed"), false);
    strictEqual(isModelNotAllowedError(null), false);
  });
});

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyStorePublishError,
  STORE_ERROR_MESSAGE_KEYS,
} from "../src/lib/store-publish-errors.ts";

/** A HoustonEngineError-shaped object: the host forwards the store body on `.body`. */
const engineError = (error: unknown) => ({
  name: "HoustonEngineError",
  status: 409,
  body: { error },
});

describe("classifyStorePublishError", () => {
  it("maps every known store machine code to a localized message key", () => {
    for (const [code, key] of Object.entries(STORE_ERROR_MESSAGE_KEYS)) {
      deepStrictEqual(classifyStorePublishError(engineError(code)), {
        kind: "key",
        key,
      });
    }
  });

  it("never surfaces an unknown snake_case code as text", () => {
    strictEqual(
      classifyStorePublishError(engineError("some_unknown_code")),
      null,
    );
    strictEqual(classifyStorePublishError(engineError("internal_error")), null);
  });

  it("passes through genuine prose from a string error field", () => {
    deepStrictEqual(
      classifyStorePublishError(engineError("That name is already taken.")),
      { kind: "text", text: "That name is already taken." },
    );
  });

  it("passes through a structured error message field", () => {
    deepStrictEqual(
      classifyStorePublishError(
        engineError({ message: "Give the agent a name." }),
      ),
      { kind: "text", text: "Give the agent a name." },
    );
  });

  it("ignores a structured error whose message is only a machine code container", () => {
    // A structured error with a code but no prose message falls back to generic.
    strictEqual(
      classifyStorePublishError(engineError({ code: "rate_limited" })),
      null,
    );
  });

  it("returns null for errors that carry no store body", () => {
    strictEqual(classifyStorePublishError(new Error("boom")), null);
    strictEqual(classifyStorePublishError(null), null);
    strictEqual(classifyStorePublishError({ status: 500 }), null);
  });
});

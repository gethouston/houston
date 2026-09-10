import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonEngineError } from "../../packages/web/src/engine-adapter/client/errors.ts";
import { isExpectedSkillSearchError } from "../src/lib/skill-search-expected-state.ts";

/** The engine-client's error exposes `kind` from `error.details.kind`. */
function engineClientError(kind: string): Error {
  return Object.assign(new Error(`engine error (${kind})`), {
    name: "HoustonEngineError",
    status: 504,
    kind,
  });
}

describe("isExpectedSkillSearchError (PRODUCT-1728)", () => {
  it("treats a skills.sh timeout as expected on the web adapter's shape", () => {
    const err = new HoustonEngineError(504, {
      error: {
        code: "UNAVAILABLE",
        message: "skills.sh search timed out after 10000ms",
        kind: "upstream_timeout",
        details: { kind: "upstream_timeout" },
      },
    });
    strictEqual(isExpectedSkillSearchError(err), true);
  });

  it("treats a skills.sh timeout as expected on the engine-client's shape", () => {
    strictEqual(
      isExpectedSkillSearchError(engineClientError("upstream_timeout")),
      true,
    );
  });

  it("treats offline and rate limiting as expected upstream weather", () => {
    strictEqual(isExpectedSkillSearchError(engineClientError("offline")), true);
    strictEqual(
      isExpectedSkillSearchError(engineClientError("rate_limited")),
      true,
    );
  });

  it("keeps a real skills.sh error loud", () => {
    strictEqual(
      isExpectedSkillSearchError(engineClientError("upstream_error")),
      false,
    );
  });

  it("keeps untyped failures loud", () => {
    strictEqual(isExpectedSkillSearchError(new Error("boom")), false);
    strictEqual(
      isExpectedSkillSearchError(new TypeError("fetch failed")),
      false,
    );
  });
});

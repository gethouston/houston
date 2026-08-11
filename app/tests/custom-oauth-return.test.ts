import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CUSTOM_OAUTH_RETURN_WINDOW_MS,
  consumeCustomOAuthReturn,
  markCustomOAuthStarted,
} from "../src/lib/custom-oauth-return.ts";

describe("custom OAuth return gate", () => {
  it("nothing armed → no return", () => {
    strictEqual(consumeCustomOAuthReturn(1_000), false);
  });

  it("a fresh start claims exactly ONE change event", () => {
    markCustomOAuthStarted(1_000);
    strictEqual(consumeCustomOAuthReturn(2_000), true);
    // One-shot: the same start never claims a second event.
    strictEqual(consumeCustomOAuthReturn(3_000), false);
  });

  it("an abandoned start expires: no surprise focus an hour later", () => {
    markCustomOAuthStarted(1_000);
    strictEqual(
      consumeCustomOAuthReturn(1_000 + CUSTOM_OAUTH_RETURN_WINDOW_MS + 1),
      false,
    );
  });

  it("re-arming refreshes the window", () => {
    markCustomOAuthStarted(1_000);
    markCustomOAuthStarted(CUSTOM_OAUTH_RETURN_WINDOW_MS + 2_000);
    strictEqual(
      consumeCustomOAuthReturn(CUSTOM_OAUTH_RETURN_WINDOW_MS + 3_000),
      true,
    );
  });
});

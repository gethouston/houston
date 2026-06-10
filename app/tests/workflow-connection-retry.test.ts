import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  connectionBlockerSatisfied,
  connectionRetryKey,
} from "../src/components/workflow-connection-retry.ts";

describe("connectionBlockerSatisfied", () => {
  it("requires a signed-in Composio session", () => {
    assert.equal(
      connectionBlockerSatisfied(
        { type: "composio_signin" },
        false,
        new Set(),
      ),
      false,
    );
    assert.equal(
      connectionBlockerSatisfied(
        { type: "composio_signin" },
        true,
        new Set(),
      ),
      true,
    );
  });

  it("matches connected toolkits after normalization", () => {
    assert.equal(
      connectionBlockerSatisfied(
        { type: "composio_toolkit", toolkit: " Gmail " },
        true,
        new Set(["gmail"]),
      ),
      true,
    );
  });
});

describe("connectionRetryKey", () => {
  it("dedupes the same blocker across remounts", () => {
    assert.equal(
      connectionRetryKey(
        "run-1",
        "send",
        { type: "composio_toolkit", toolkit: "Gmail" },
      ),
      "run-1:send:gmail",
    );
  });

  it("keeps sequential blockers distinct", () => {
    const signin = connectionRetryKey(
      "run-1",
      "send",
      { type: "composio_signin" },
    );
    const toolkit = connectionRetryKey(
      "run-1",
      "send",
      { type: "composio_toolkit", toolkit: "gmail" },
    );
    assert.notEqual(signin, toolkit);
  });
});

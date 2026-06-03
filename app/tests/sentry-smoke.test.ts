import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sentrySmokeActionForKey } from "../src/lib/sentry-smoke-shortcut.ts";

describe("sentry smoke shortcut mapping", () => {
  it("maps Ctrl+Alt+Shift+J to the JavaScript smoke test", () => {
    assert.equal(
      sentrySmokeActionForKey({
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        key: "J",
      }),
      "javascript",
    );
  });

  it("maps Ctrl+Alt+Shift+N to the native smoke test", () => {
    assert.equal(
      sentrySmokeActionForKey({
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        key: "n",
      }),
      "native",
    );
  });

  it("ignores nearby shortcuts", () => {
    assert.equal(
      sentrySmokeActionForKey({
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        key: "j",
      }),
      null,
    );
  });
});

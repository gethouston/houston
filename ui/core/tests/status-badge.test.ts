import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  STATUS_DOT_CLASS,
  STATUS_TEXT_CLASS,
  type StatusKind,
} from "../src/components/status-badge-styles.ts";

describe("status-badge styles", () => {
  it("maps each status to its semantic dot color token", () => {
    assert.equal(STATUS_DOT_CLASS.active, "bg-success");
    assert.equal(STATUS_DOT_CLASS.pending, "bg-warning");
    assert.equal(STATUS_DOT_CLASS.error, "bg-danger");
  });

  it("maps each status to the INK of its hue, never the fill, for the label", () => {
    // A fill is tuned to carry its own `-text` label; worn as text on the page
    // it measures 3.4:1 (green) and 2.1:1 (amber). The `-ink` variants are the
    // same hues retuned for 4.5:1, guarded by the design-tokens contrast test.
    assert.equal(STATUS_TEXT_CLASS.active, "text-success-ink");
    assert.equal(STATUS_TEXT_CLASS.pending, "text-warning-ink");
    assert.equal(STATUS_TEXT_CLASS.error, "text-danger-ink");
  });

  it("covers exactly the three status kinds", () => {
    const kinds: StatusKind[] = ["active", "pending", "error"];
    assert.deepEqual(Object.keys(STATUS_DOT_CLASS).sort(), [...kinds].sort());
    assert.deepEqual(Object.keys(STATUS_TEXT_CLASS).sort(), [...kinds].sort());
  });
});

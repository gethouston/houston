import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { INTERACTION_DETAIL_CLASS } from "../src/interaction-detail-model.ts";

/**
 * The approval-card detail block's contract, locked here because breaking any
 * one of these silently changes what the user is agreeing to: a value they
 * cannot fully see is a value they did not approve.
 */
describe("interaction detail block", () => {
  const classes = INTERACTION_DETAIL_CLASS.split(" ");

  it("scrolls inside a bounded height instead of clipping or pushing the answer row away", () => {
    assert.ok(classes.includes("max-h-48"));
    assert.ok(classes.includes("overflow-auto"));
  });

  it("keeps whitespace and renders monospaced, so the value reads as it would be written", () => {
    assert.ok(classes.includes("whitespace-pre-wrap"));
    assert.ok(classes.includes("break-words"));
    assert.ok(classes.includes("font-mono"));
  });

  it("lets the user select the value they are approving", () => {
    assert.ok(classes.includes("select-text"));
  });

  it("never truncates: no line clamp, no fixed height", () => {
    assert.equal(
      classes.some((c) => c.startsWith("line-clamp-") || c.startsWith("h-")),
      false,
    );
  });

  it("styles from design tokens only, never a hardcoded colour", () => {
    assert.doesNotMatch(INTERACTION_DETAIL_CLASS, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(INTERACTION_DETAIL_CLASS, /\brgba?\(/);
    assert.doesNotMatch(INTERACTION_DETAIL_CLASS, /\[[^\]]*#/);
  });
});

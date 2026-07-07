import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  hasSelectableOptions,
  normalizeAnswer,
  OWN_ANSWER_TOGGLE_CLASS,
  QUESTION_TEXT_CLASS,
} from "../src/question-card-logic.ts";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe("hasSelectableOptions", () => {
  it("is true when the agent offered concrete choices", () => {
    assert.equal(hasSelectableOptions([{ id: "a", label: "Yes" }]), true);
  });

  it("is false for an empty or missing option list (free-text only)", () => {
    assert.equal(hasSelectableOptions([]), false);
    assert.equal(hasSelectableOptions(undefined), false);
  });
});

describe("normalizeAnswer", () => {
  it("trims a typed answer", () => {
    assert.equal(normalizeAnswer("  last quarter  "), "last quarter");
  });

  it("blocks a whitespace-only answer from being sent", () => {
    assert.equal(normalizeAnswer("   "), null);
    assert.equal(normalizeAnswer(""), null);
  });
});

describe("question-card class tokens", () => {
  // The card replaces the composer, so the question must read as the single
  // next action — sized up and weighted.
  it("renders the question prominently", () => {
    const t = tokens(QUESTION_TEXT_CLASS);
    assert.ok(t.has("text-lg"));
    assert.ok(t.has("font-medium"));
  });

  // No-hover-only-affordances rule: the "answer in your own words" toggle must
  // be visible at rest, never gated behind a hover/opacity trick.
  it("keeps the free-text toggle visible without hover", () => {
    const t = tokens(OWN_ANSWER_TOGGLE_CLASS);
    assert.ok(!t.has("hidden"));
    assert.ok(!t.has("opacity-0"));
    assert.ok(!t.has("group-hover:opacity-100"));
    for (const token of t) {
      assert.ok(
        !token.startsWith("group-hover:"),
        `toggle must not be hover-gated: ${token}`,
      );
    }
  });
});

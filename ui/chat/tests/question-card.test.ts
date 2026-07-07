import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChatQuestion,
  canSend,
  composeReply,
  hasSelectableOptions,
  isFastPath,
  normalizeAnswer,
  QUESTION_TEXT_CLASS,
  QUESTION_TEXT_CLASS_BATCHED,
} from "../src/question-card-logic.ts";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

const Q1: ChatQuestion = {
  id: "q1",
  question: "Which quarter?",
  options: [
    { id: "o1", label: "Q1" },
    { id: "o2", label: "Q2" },
  ],
};
const Q2: ChatQuestion = {
  id: "q2",
  question: "Include drafts?",
  options: [
    { id: "y", label: "Yes" },
    { id: "n", label: "No" },
  ],
};
const OPEN: ChatQuestion = { id: "q3", question: "Anything else?" };

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

describe("composeReply", () => {
  it("returns null when nothing is answered", () => {
    assert.equal(composeReply([Q1], {}, ""), null);
    assert.equal(composeReply([Q1], { q1: null }, "  "), null);
  });

  it("emits '<question>: <label>' for one answered question", () => {
    assert.equal(composeReply([Q1], { q1: "o2" }, ""), "Which quarter?: Q2");
  });

  it("joins multiple answered questions with newlines", () => {
    const reply = composeReply([Q1, Q2], { q1: "o1", y: "n", q2: "y" }, "");
    assert.equal(reply, "Which quarter?: Q1\nInclude drafts?: Yes");
  });

  it("skips unanswered questions in a batch", () => {
    const reply = composeReply([Q1, Q2], { q2: "n" }, "");
    assert.equal(reply, "Include drafts?: No");
  });

  it("appends trimmed free text after a blank line", () => {
    const reply = composeReply([Q1], { q1: "o1" }, "  and Q4 too ");
    assert.equal(reply, "Which quarter?: Q1\n\nand Q4 too");
  });

  it("returns just the text when only free text is given", () => {
    assert.equal(composeReply([OPEN], {}, "  the report "), "the report");
  });

  it("ignores a selected option id that no longer exists", () => {
    assert.equal(composeReply([Q1], { q1: "gone" }, ""), null);
  });
});

describe("canSend", () => {
  it("is disabled with no selection and no text", () => {
    assert.equal(canSend([Q1, Q2], {}, ""), false);
  });

  it("is enabled with at least one selection", () => {
    assert.equal(canSend([Q1, Q2], { q1: "o1" }, ""), true);
  });

  it("is enabled with only free text", () => {
    assert.equal(canSend([Q1], {}, "typed"), true);
  });
});

describe("isFastPath", () => {
  it("is true for one question with options and an empty input", () => {
    assert.equal(isFastPath([Q1], ""), true);
    assert.equal(isFastPath([Q1], "   "), true);
  });

  it("is false when the input has text", () => {
    assert.equal(isFastPath([Q1], "wait"), false);
  });

  it("is false for multiple questions", () => {
    assert.equal(isFastPath([Q1, Q2], ""), false);
  });

  it("is false for a single open (option-less) question", () => {
    assert.equal(isFastPath([OPEN], ""), false);
  });
});

describe("question-card class tokens", () => {
  // A lone question replaces the composer, so it reads as the single next
  // action — sized up and weighted.
  it("renders a solo question prominently (text-lg)", () => {
    const t = tokens(QUESTION_TEXT_CLASS);
    assert.ok(t.has("text-lg"));
    assert.ok(t.has("font-medium"));
  });

  // Batched questions drop to the base size so the stack has rhythm without
  // every head shouting.
  it("drops batched question heads to text-base", () => {
    const t = tokens(QUESTION_TEXT_CLASS_BATCHED);
    assert.ok(t.has("text-base"));
    assert.ok(t.has("font-medium"));
  });
});

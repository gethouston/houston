import test from "node:test";
import assert from "node:assert/strict";
import {
  autoAdvancesOnOptionPick,
  isDraftComplete,
  emptyDraft,
} from "../src/question-card-state.ts";

test("autoAdvancesOnOptionPick is true for single-select", () => {
  assert.equal(
    autoAdvancesOnOptionPick({
      id: "q1",
      prompt: "Pick one",
      options: [{ id: "a", label: "A" }],
      allowMultiple: false,
    }),
    true,
  );
});

test("autoAdvancesOnOptionPick is false for multi-select", () => {
  assert.equal(
    autoAdvancesOnOptionPick({
      id: "q1",
      prompt: "Pick many",
      options: [{ id: "a", label: "A" }],
      allowMultiple: true,
    }),
    false,
  );
});

test("isDraftComplete for single-select requires one option", () => {
  const q = {
    id: "q1",
    prompt: "Pick one",
    options: [{ id: "a", label: "A" }],
    allowMultiple: false,
  };
  assert.equal(isDraftComplete(q, emptyDraft()), false);
  assert.equal(
    isDraftComplete(q, { optionIds: ["a"], text: "", freeTextMode: false }),
    true,
  );
});

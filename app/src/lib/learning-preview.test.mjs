import assert from "node:assert/strict";
import test from "node:test";
import {
  LEARNING_PREVIEW_LIMIT,
  learningNeedsExpansion,
  learningPreviewText,
} from "./learning-preview.ts";

test("learning preview leaves short text alone", () => {
  assert.equal(learningNeedsExpansion("Keep replies terse."), false);
  assert.equal(
    learningPreviewText("Keep replies terse."),
    "Keep replies terse.",
  );
});

test("learning preview collapses long text with visible ellipsis", () => {
  const text = "Remember ".repeat(40);
  const preview = learningPreviewText(text);

  assert.equal(learningNeedsExpansion(text), true);
  assert.equal(preview.endsWith("..."), true);
  assert.ok(preview.length <= LEARNING_PREVIEW_LIMIT + 3);
});

test("learning preview normalizes multiline text", () => {
  assert.equal(
    learningPreviewText("First line\n\nsecond\tline"),
    "First line second line",
  );
});

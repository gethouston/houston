import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanGeneratedTitle,
  fallbackMissionTitle,
} from "./mission-title-text.ts";

test("fallback mission title trims long text on word boundary", () => {
  assert.equal(
    fallbackMissionTitle(
      "Please write a long investor update for the whole team",
    ),
    "Please write a long investor update for...",
  );
});

test("fallback mission title handles empty text", () => {
  assert.equal(fallbackMissionTitle("   \n\t"), "New mission");
});

test("clean generated title limits noisy model output", () => {
  assert.equal(
    cleanGeneratedTitle('"Plan the launch email campaign today please."'),
    "Plan the launch email campaign today",
  );
});

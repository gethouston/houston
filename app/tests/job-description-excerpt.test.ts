import assert from "node:assert/strict";
import test from "node:test";
import { jobDescriptionExcerpt } from "../src/lib/job-description-excerpt.ts";

test("an excerpt reads as the job, never as the fence", () => {
  assert.equal(
    jobDescriptionExcerpt(
      "---\nindustry: Healthcare\nrole: Medical coder\n---\n\nI chase rejected claims.",
    ),
    "I chase rejected claims.",
  );
  assert.equal(
    jobDescriptionExcerpt(
      "---\nindustry: Healthcare\nrole: Medical coder\n---\n",
    ),
    "Healthcare · Medical coder",
  );
  assert.equal(
    jobDescriptionExcerpt("---\nindustry: Healthcare\nrole: Medical cod"),
    "Healthcare · Medical cod",
  );
  assert.equal(jobDescriptionExcerpt("Plain prose."), "Plain prose.");
});

test("a description that opens with a rule is shown as it arrived", () => {
  const text = "---\nJust words, not a block";
  assert.equal(jobDescriptionExcerpt(text), text);
});

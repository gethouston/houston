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
  // Nothing written below the block yet: the facts are what there is to read.
  assert.equal(
    jobDescriptionExcerpt(
      "---\nindustry: Healthcare\nrole: Medical coder\n---\n",
    ),
    "Healthcare · Medical coder",
  );
  // Cut mid-block by the excerpt cap, so there is no closing fence to find.
  assert.equal(
    jobDescriptionExcerpt("---\nindustry: Healthcare\nrole: Medical cod"),
    "Healthcare · Medical cod",
  );
  assert.equal(jobDescriptionExcerpt("Plain prose."), "Plain prose.");
});

test("a description that opens with a rule is shown as it arrived", () => {
  // Closing a fence we invented would only be right if it yielded facts; here
  // the words are the description, and the row shows them rather than nothing.
  const text = "---\nJust words, not a block";
  assert.equal(jobDescriptionExcerpt(text), text);
});

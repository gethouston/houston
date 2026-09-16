import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJobDescription } from "@houston/sdk/job-description";
import {
  appendSetupSection,
  stripSetupSection,
} from "../src/components/onboarding/tutorial-system-prompt.ts";

const CHOICES = { toolkit: "gmail", toolkitLabel: "Gmail", toMyself: true };

test("append -> strip round-trips the user's CLAUDE.md byte-for-byte-ish", () => {
  const original = "# My agent\n\nBe helpful.\n";
  const appended = appendSetupSection(original, CHOICES);
  assert.notEqual(appended, original);
  assert.match(appended, /TUTORIAL_COMPLETE/);
  const stripped = stripSetupSection(appended);
  assert.ok(!stripped.includes("TUTORIAL_COMPLETE"));
  assert.ok(stripped.includes("Be helpful."));
  // Strip is idempotent, and a never-appended file passes through.
  assert.equal(stripSetupSection(stripped), stripped);
  assert.equal(stripSetupSection(original), original);
});

test("append is idempotent: an existing section is never doubled", () => {
  const once = appendSetupSection("hello", CHOICES);
  assert.equal(appendSetupSection(once, CHOICES), once);
});

test("the directive rides BELOW the job description's block of facts", () => {
  // The tutorial writes into the same file the Job description tab edits, so
  // the facts at its head must survive an append and a strip untouched —
  // otherwise a tutorial run would silently un-hire the agent.
  const original = "---\nindustry: Healthcare\nrole: Medical coder\n---\n";
  const appended = appendSetupSection(original, CHOICES);
  assert.deepEqual(parseJobDescription(appended), {
    fields: { industry: "Healthcare", role: "Medical coder" },
    body: appended
      .slice(appended.indexOf("<!-- HOUSTON_SETUP_BEGIN -->"))
      .trim(),
    extraKeys: {},
  });
  assert.equal(stripSetupSection(appended), original);
});

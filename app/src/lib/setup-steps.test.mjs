import assert from "node:assert/strict";
import { test } from "node:test";
import { stepSection } from "./setup-steps.ts";

test("Setup is one logical step; Connect-your-AI spans pick + login", () => {
  assert.deepEqual(stepSection("brain"), {
    section: "setup",
    current: 1,
    total: 1,
  });
  assert.deepEqual(stepSection("providerLogin"), {
    section: "setup",
    current: 1,
    total: 1,
  });
  // The apps/tools step was dropped (platform-mode Composio has no per-user
  // account to sign into); it is no longer a numbered step.
  assert.equal(stepSection("tools"), null);
});

test("Onboarding is three logical steps", () => {
  assert.deepEqual(stepSection("meet"), {
    section: "onboarding",
    current: 1,
    total: 3,
  });
  assert.deepEqual(stepSection("connectEmail"), {
    section: "onboarding",
    current: 2,
    total: 3,
  });
  assert.deepEqual(stepSection("emailChat"), {
    section: "onboarding",
    current: 3,
    total: 3,
  });
});

test("gates and success screens are not numbered steps", () => {
  assert.equal(stepSection("language"), null);
  assert.equal(stepSection("agreement"), null);
  assert.equal(stepSection("aiConnected"), null);
  assert.equal(stepSection("finished"), null);
});

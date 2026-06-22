import assert from "node:assert/strict";
import { test } from "node:test";
import { SETUP_STEPS, stepSection } from "./setup-steps.ts";

test("setup steps are the full ordered flow", () => {
  assert.deepEqual(SETUP_STEPS, [
    "language",
    "agreement",
    "brain",
    "providerLogin",
    "tools",
    "meet",
    "email",
  ]);
});

test("each step is numbered within its own section", () => {
  // Setup phase: language, agreement, brain, providerLogin, tools (5).
  assert.deepEqual(stepSection("language"), {
    section: "setup",
    current: 1,
    total: 5,
  });
  assert.deepEqual(stepSection("brain"), {
    section: "setup",
    current: 3,
    total: 5,
  });
  assert.deepEqual(stepSection("tools"), {
    section: "setup",
    current: 5,
    total: 5,
  });
  // Onboarding phase: meet, email (2).
  assert.deepEqual(stepSection("meet"), {
    section: "onboarding",
    current: 1,
    total: 2,
  });
  assert.deepEqual(stepSection("email"), {
    section: "onboarding",
    current: 2,
    total: 2,
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { SETUP_STEPS, setupStepNumber } from "./setup-steps.ts";

test("setup steps are the full ordered flow", () => {
  assert.deepEqual(SETUP_STEPS, [
    "language",
    "agreement",
    "meet",
    "brain",
    "providerLogin",
    "tools",
    "email",
  ]);
});

test("step numbers are 1-based with a consistent total", () => {
  assert.deepEqual(setupStepNumber("language"), { current: 1, total: 7 });
  assert.deepEqual(setupStepNumber("agreement"), { current: 2, total: 7 });
  assert.deepEqual(setupStepNumber("meet"), { current: 3, total: 7 });
  assert.deepEqual(setupStepNumber("email"), { current: 7, total: 7 });
});

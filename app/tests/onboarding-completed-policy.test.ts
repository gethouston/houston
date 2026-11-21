import assert from "node:assert";
import { test } from "node:test";
import { resolveOnboardingCompleted } from "../src/lib/onboarding-completed-policy.ts";

test("account pref set → completed, and the device mirror is refreshed", () => {
  assert.deepStrictEqual(resolveOnboardingCompleted("completed", false), {
    completed: true,
    refreshMirror: true,
    healAccount: false,
  });
  assert.deepStrictEqual(resolveOnboardingCompleted("completed", true), {
    completed: true,
    refreshMirror: true,
    healAccount: false,
  });
});

test("both stores empty → genuinely fresh, first-run onboarding unchanged", () => {
  assert.deepStrictEqual(resolveOnboardingCompleted("unset", false), {
    completed: false,
    refreshMirror: false,
    healAccount: false,
  });
});

test("mirror-only completion reads completed AND heals the account pref", () => {
  assert.deepStrictEqual(resolveOnboardingCompleted("unset", true), {
    completed: true,
    refreshMirror: false,
    healAccount: true,
  });
});

test("unreachable host never downgrades a mirrored completion, never heals", () => {
  assert.deepStrictEqual(resolveOnboardingCompleted("unreachable", true), {
    completed: true,
    refreshMirror: false,
    healAccount: false,
  });
});

test("unreachable host with no mirror reads not-completed", () => {
  assert.deepStrictEqual(resolveOnboardingCompleted("unreachable", false), {
    completed: false,
    refreshMirror: false,
    healAccount: false,
  });
});

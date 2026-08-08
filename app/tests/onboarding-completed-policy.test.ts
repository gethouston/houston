import assert from "node:assert";
import { test } from "node:test";
import { resolveOnboardingCompleted } from "../src/lib/onboarding-completed-policy.ts";

// PRODUCT-1282: the durable `onboarding_completed` flag is merged from the
// ACCOUNT preference (survives sign-out) and the per-uid device mirror
// (survives an unreachable host). Upgrade-only: either store saying completed
// wins; a completed user is never routed back into first-run onboarding.

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
  // A pre-fix device-local completion (or a lost write): without the heal the
  // flag would die on the next sign-out's localStorage purge all over again.
  assert.deepStrictEqual(resolveOnboardingCompleted("unset", true), {
    completed: true,
    refreshMirror: false,
    healAccount: true,
  });
});

test("unreachable host never downgrades a mirrored completion, never heals", () => {
  // The mirror carries the flag through the outage; a heal write would fail
  // against the same unreachable host, so it is not attempted.
  assert.deepStrictEqual(resolveOnboardingCompleted("unreachable", true), {
    completed: true,
    refreshMirror: false,
    healAccount: false,
  });
});

test("unreachable host with no mirror reads not-completed", () => {
  // Nothing to upgrade from: behaves like today's boot against a cold host.
  assert.deepStrictEqual(resolveOnboardingCompleted("unreachable", false), {
    completed: false,
    refreshMirror: false,
    healAccount: false,
  });
});

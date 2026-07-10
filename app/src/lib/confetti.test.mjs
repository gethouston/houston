import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  fireSetupConfetti,
  prefersReducedMotion,
  SETUP_CONFETTI_BURSTS,
} from "./confetti.ts";

const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});

test("the setup celebration is exactly three bursts sharing one base config", () => {
  // Locking the single source of truth so ready-step and setup-progress can
  // never drift apart again (the duplication these tests replaced).
  assert.equal(SETUP_CONFETTI_BURSTS.length, 3);
  for (const burst of SETUP_CONFETTI_BURSTS) {
    assert.equal(burst.startVelocity, 45);
    assert.equal(burst.ticks, 220);
    assert.equal(burst.zIndex, 9999);
    assert.equal(burst.scalar, 0.9);
  }
  assert.deepEqual(
    SETUP_CONFETTI_BURSTS.map((b) => b.particleCount),
    [140, 70, 70],
  );
});

test("fireSetupConfetti fires every burst in order when motion is allowed", () => {
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const fired = [];
  fireSetupConfetti((opts) => fired.push(opts));
  assert.deepEqual(fired, SETUP_CONFETTI_BURSTS);
});

test("fireSetupConfetti fires nothing when the user prefers reduced motion", () => {
  globalThis.window = {
    matchMedia: (q) => ({ matches: q === "(prefers-reduced-motion: reduce)" }),
  };
  assert.equal(prefersReducedMotion(), true);
  const fired = [];
  fireSetupConfetti((opts) => fired.push(opts));
  assert.equal(fired.length, 0);
});

import { afterEach, expect, test } from "vitest";
import { beginDrain, isDraining, resetDrainForTests } from "./drain";

afterEach(resetDrainForTests);

test("a runtime is not draining until a shutdown signal lands", () => {
  expect(isDraining()).toBe(false);
});

test("beginDrain latches: once draining, always draining", () => {
  beginDrain();
  beginDrain();
  expect(isDraining()).toBe(true);
});

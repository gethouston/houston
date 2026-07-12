import { expect, test } from "vitest";
import { currentTurnMode, runWithTurnMode } from "./turn-mode-context";

/**
 * The per-turn mode ambient: an AsyncLocalStorage the integration tools read to
 * decide whether to forward `x-houston-turn-mode: auto`. These pin: the mode is
 * present inside the capture, undefined outside a turn, and two nested captures
 * stay isolated (the inner value never leaks back out).
 */

test("the mode is present inside runWithTurnMode and undefined outside", () => {
  expect(currentTurnMode()).toBeUndefined();
  const seen = runWithTurnMode("auto", () => currentTurnMode());
  expect(seen).toBe("auto");
  // The store is unwound once the callback returns.
  expect(currentTurnMode()).toBeUndefined();
});

test("each mode value flows through independently", () => {
  expect(runWithTurnMode("execute", () => currentTurnMode())).toBe("execute");
  expect(runWithTurnMode("plan", () => currentTurnMode())).toBe("plan");
  expect(runWithTurnMode("auto", () => currentTurnMode())).toBe("auto");
});

test("nested captures stay isolated — the inner value never leaks out", () => {
  runWithTurnMode("execute", () => {
    expect(currentTurnMode()).toBe("execute");
    runWithTurnMode("auto", () => {
      expect(currentTurnMode()).toBe("auto");
    });
    // Back in the outer capture, the outer mode is restored.
    expect(currentTurnMode()).toBe("execute");
  });
});

test("the mode survives async work inside the capture (ALS propagation)", async () => {
  const seen = await runWithTurnMode("auto", async () => {
    await Promise.resolve();
    return currentTurnMode();
  });
  expect(seen).toBe("auto");
});

import type { TurnMode } from "@houston/protocol";
import { expect, test } from "vitest";
import { currentTurnMode, runWithTurnMode } from "./turn-mode-context";

test("the mode is present inside runWithTurnMode and undefined outside", () => {
  expect(currentTurnMode()).toBeUndefined();
  const seen = runWithTurnMode({ current: "auto" }, () => currentTurnMode());
  expect(seen).toBe("auto");
  expect(currentTurnMode()).toBeUndefined();
});

test("each mode value flows through independently", () => {
  expect(runWithTurnMode({ current: "execute" }, () => currentTurnMode())).toBe(
    "execute",
  );
  expect(runWithTurnMode({ current: "plan" }, () => currentTurnMode())).toBe(
    "plan",
  );
  expect(runWithTurnMode({ current: "auto" }, () => currentTurnMode())).toBe(
    "auto",
  );
});

test("nested captures stay isolated — the inner value never leaks out", () => {
  runWithTurnMode({ current: "execute" }, () => {
    expect(currentTurnMode()).toBe("execute");
    runWithTurnMode({ current: "auto" }, () => {
      expect(currentTurnMode()).toBe("auto");
    });
    expect(currentTurnMode()).toBe("execute");
  });
});

test("the mode survives async work inside the capture (ALS propagation)", async () => {
  const seen = await runWithTurnMode({ current: "auto" }, async () => {
    await Promise.resolve();
    return currentTurnMode();
  });
  expect(seen).toBe("auto");
});

test("a mid-capture ref mutation is visible at once (live Mode-pill switch)", async () => {
  const ref: { current: TurnMode } = { current: "execute" };
  await runWithTurnMode(ref, async () => {
    expect(currentTurnMode()).toBe("execute");
    ref.current = "plan";
    await Promise.resolve();
    expect(currentTurnMode()).toBe("plan");
  });
});

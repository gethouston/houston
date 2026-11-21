import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createBurstGate,
  TOAST_DEDUPE_WINDOW_MS,
} from "../src/lib/error-burst.ts";

describe("createBurstGate", () => {
  it("passes the first occurrence and swallows repeats in the window", () => {
    const gate = createBurstGate();
    strictEqual(gate.isFirst("boom", 0), true);
    strictEqual(gate.isFirst("boom", 1), false);
    strictEqual(gate.isFirst("boom", TOAST_DEDUPE_WINDOW_MS), false);
  });

  it("keeps distinct keys independent", () => {
    const gate = createBurstGate();
    strictEqual(gate.isFirst("a", 0), true);
    strictEqual(gate.isFirst("b", 0), true);
    strictEqual(gate.isFirst("a", 10), false);
    strictEqual(gate.isFirst("b", 10), false);
  });

  it("passes again once the window has fully elapsed", () => {
    const gate = createBurstGate();
    strictEqual(gate.isFirst("boom", 0), true);
    strictEqual(gate.isFirst("boom", TOAST_DEDUPE_WINDOW_MS + 1), true);
  });

  it("a repeat refreshes the window, so a failure loop stays collapsed", () => {
    const gate = createBurstGate(1_000);
    strictEqual(gate.isFirst("boom", 0), true);
    for (let t = 600; t <= 6_000; t += 600) {
      strictEqual(gate.isFirst("boom", t), false, `re-fired at ${t}ms`);
    }
  });

  it("evicts stale keys instead of growing without bound", () => {
    const gate = createBurstGate(1_000);
    for (let i = 0; i < 500; i += 1) gate.isFirst(`key-${i}`, i);
    strictEqual(gate.isFirst("key-0", 10_000), true);
    strictEqual(gate.isFirst("key-499", 10_000), true);
  });

  it("honors a custom window", () => {
    const gate = createBurstGate(100);
    strictEqual(gate.isFirst("boom", 0), true);
    strictEqual(gate.isFirst("boom", 100), false);
    strictEqual(gate.isFirst("boom", 200), false);
    strictEqual(gate.isFirst("boom", 301), true);
  });
});

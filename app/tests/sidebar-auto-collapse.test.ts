import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveAutoCollapse,
  SIDEBAR_AUTO_COLLAPSE_WIDTH as W,
} from "../src/lib/sidebar-auto-collapse.ts";

describe("resolveAutoCollapse", () => {
  it("collapses on the first run when the window is already narrow", () => {
    strictEqual(resolveAutoCollapse(null, W - 1), true);
  });

  it("does nothing on the first run when the window is wide", () => {
    // Respects a persisted choice on a wide window (no forced expand).
    strictEqual(resolveAutoCollapse(null, W + 200), null);
  });

  it("collapses when crossing below the threshold", () => {
    strictEqual(resolveAutoCollapse(W + 50, W - 1), true);
  });

  it("expands when crossing above the threshold", () => {
    strictEqual(resolveAutoCollapse(W - 50, W + 1), false);
  });

  it("does nothing while staying narrow (a manual expand sticks)", () => {
    strictEqual(resolveAutoCollapse(W - 100, W - 50), null);
  });

  it("does nothing while staying wide (a manual collapse sticks)", () => {
    strictEqual(resolveAutoCollapse(W + 100, W + 200), null);
  });

  it("treats exactly the threshold as wide at the boundary", () => {
    // width === threshold counts as wide → crossing up expands…
    strictEqual(resolveAutoCollapse(W - 10, W), false);
    // …and dropping just under it collapses.
    strictEqual(resolveAutoCollapse(W, W - 1), true);
  });

  it("honours a custom threshold", () => {
    strictEqual(resolveAutoCollapse(900, 700, 800), true);
    strictEqual(resolveAutoCollapse(700, 900, 800), false);
  });
});

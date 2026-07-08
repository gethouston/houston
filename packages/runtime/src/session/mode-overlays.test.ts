import { expect, test } from "vitest";
import {
  AUTO_MODE_OVERLAY,
  PLAN_MODE_OVERLAY,
  withModeOverlay,
} from "./mode-overlays";

test("withModeOverlay appends the plan overlay only for plan mode", () => {
  const base = "You are Houston.";
  expect(withModeOverlay(base, "plan")).toBe(`${base}\n\n${PLAN_MODE_OVERLAY}`);
});

test("withModeOverlay appends the auto overlay only for auto mode", () => {
  const base = "You are Houston.";
  expect(withModeOverlay(base, "auto")).toBe(`${base}\n\n${AUTO_MODE_OVERLAY}`);
});

test("withModeOverlay passes the prompt through for execute / absent mode", () => {
  const base = "You are Houston.";
  expect(withModeOverlay(base, "execute")).toBe(base);
  expect(withModeOverlay(base)).toBe(base);
});

test("each overlay is placed LAST, after the base prompt", () => {
  const base = "BASE-PROMPT-MARKER";
  const plan = withModeOverlay(base, "plan");
  expect(plan.indexOf(base)).toBeLessThan(plan.indexOf(PLAN_MODE_OVERLAY));
  expect(plan.endsWith(PLAN_MODE_OVERLAY)).toBe(true);
  const auto = withModeOverlay(base, "auto");
  expect(auto.indexOf(base)).toBeLessThan(auto.indexOf(AUTO_MODE_OVERLAY));
  expect(auto.endsWith(AUTO_MODE_OVERLAY)).toBe(true);
});

test("both overlays speak in a non-technical voice (no file/JSON/CLI jargon)", () => {
  // The target user is non-technical; the product prompt forbids naming files,
  // JSON, configs, or CLIs. Guard the overlay copy against that jargon leaking in.
  for (const overlay of [PLAN_MODE_OVERLAY, AUTO_MODE_OVERLAY]) {
    const lower = overlay.toLowerCase();
    for (const banned of ["file", "json", "cli"])
      expect(lower).not.toContain(banned);
  }
});

test("the plan overlay establishes the read-only, plan-then-approve contract", () => {
  const lower = PLAN_MODE_OVERLAY.toLowerCase();
  expect(lower).toContain("plan mode");
  expect(lower).toContain("must not change anything");
  expect(lower).toContain("review");
});

test("the auto overlay establishes the never-wait, act-and-report contract", () => {
  const lower = AUTO_MODE_OVERLAY.toLowerCase();
  expect(lower).toContain("autopilot mode");
  expect(lower).toContain("do not ask the user");
  // Auto acts on its own judgment and closes with a report.
  expect(lower).toContain("assum");
  expect(lower).toContain("report");
});

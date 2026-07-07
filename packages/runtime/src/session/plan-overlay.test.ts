import { expect, test } from "vitest";
import { PLAN_MODE_OVERLAY, withPlanOverlay } from "./plan-overlay";

test("withPlanOverlay appends the overlay only for plan mode", () => {
  const base = "You are Houston.";
  expect(withPlanOverlay(base, "plan")).toBe(`${base}\n\n${PLAN_MODE_OVERLAY}`);
});

test("withPlanOverlay passes the prompt through for execute / absent mode", () => {
  const base = "You are Houston.";
  expect(withPlanOverlay(base, "execute")).toBe(base);
  expect(withPlanOverlay(base)).toBe(base);
});

test("the overlay is placed LAST, after the base prompt", () => {
  const base = "BASE-PROMPT-MARKER";
  const out = withPlanOverlay(base, "plan");
  expect(out.indexOf(base)).toBeLessThan(out.indexOf(PLAN_MODE_OVERLAY));
  expect(out.endsWith(PLAN_MODE_OVERLAY)).toBe(true);
});

test("the overlay speaks in a non-technical voice (no file/JSON/CLI jargon)", () => {
  // The target user is non-technical; the product prompt forbids naming files,
  // JSON, configs, or CLIs. Guard the overlay copy against that jargon leaking in.
  const lower = PLAN_MODE_OVERLAY.toLowerCase();
  for (const banned of ["file", "json", "cli"])
    expect(lower).not.toContain(banned);
});

test("the overlay establishes the read-only, plan-then-approve contract", () => {
  const lower = PLAN_MODE_OVERLAY.toLowerCase();
  expect(lower).toContain("plan mode");
  expect(lower).toContain("must not change anything");
  expect(lower).toContain("review");
});

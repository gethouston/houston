import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { breakpoint, breakpointPx } from "@houston/design-tokens";

const globalsCss = readFileSync(
  join(import.meta.dirname, "../src/globals.css"),
  "utf8",
);

test("globals.css --breakpoint-md matches the breakpoint token", () => {
  const match = globalsCss.match(/--breakpoint-md:\s*([^;]+);/);
  assert.ok(match, "globals.css must declare --breakpoint-md");
  assert.equal(match[1].trim(), breakpoint.mobile);
});

test("the px form agrees with the dimension form", () => {
  assert.equal(`${breakpointPx.mobile}px`, breakpoint.mobile);
});

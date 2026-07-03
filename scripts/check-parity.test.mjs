import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkParity } from "./check-parity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "parity", "__fixtures__");
const realInventory = join(here, "..", "design", "inventory");

const run = (name) => checkParity(join(fixtures, name));

describe("check-parity", () => {
  it("passes on the real design/inventory files", () => {
    const { violations } = checkParity(realInventory);
    expect(violations).toEqual([]);
  });

  it("passes a well-formed fixture (implemented + partial + not-started)", () => {
    const { violations, report } = run("valid");
    expect(violations).toEqual([]);
    // Unenforced ios surface still shows up in the non-blocking lag report.
    expect(report).toMatch(/ios/);
  });

  it("FAILS when a manifest references a component absent from the inventory", () => {
    const { violations } = run("unknown-component");
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some((v) => /unknown component "ghost-component"/.test(v)),
    ).toBe(true);
  });

  it("FAILS when an enforced surface lags its declared inventoryVersion", () => {
    const { violations } = run("enforced-lagging");
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some((v) =>
        /enforced surface at inventoryVersion 1 has "comp-b".*not-started/.test(
          v,
        ),
      ),
    ).toBe(true);
  });

  it("FAILS on a typo'd status value", () => {
    const { violations } = run("bad-status");
    expect(violations.some((v) => /status must be one of/.test(v))).toBe(true);
  });

  it("FAILS when the version is bumped without a matching CHANGELOG entry", () => {
    const { violations } = run("changelog-missing");
    expect(violations.some((v) => /no "## v2" entry/.test(v))).toBe(true);
  });
});

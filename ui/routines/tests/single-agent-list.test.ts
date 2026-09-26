import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Every Routines list belongs to one AI Employee, so no row names its owner.
test("no row or grid carries an owner chip", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const name of readdirSync(dir)) {
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(source, /ownerChip|OwnerChip|cross-agent/, name);
  }
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /ownerChip|cross-agent/);
});

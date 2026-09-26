import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the README example folds a group from its header and stores drops", () => {
  const readme = read("../README.md");
  assert.doesNotMatch(readme, /openOrFoldTeam|openTeamId|team's\s+screen/);
  assert.doesNotMatch(readme, /carries no destination rows/);
  assert.match(readme, /onArrange=\{/);
});

test("onActivateGroup is documented as the fold toggle", () => {
  assert.doesNotMatch(read("../src/sidebar-props.ts"), /block's screen/);
});

test("the group header promises only what the tree wires", () => {
  const source = read("../src/sidebar-group-header.tsx");
  assert.doesNotMatch(source, /contentId|Three things|exactly as before/);
});

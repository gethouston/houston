import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/sidebar-item-row.tsx", import.meta.url),
  "utf8",
);

describe("SidebarItemRow affordance", () => {
  it("forwards the optional item affordance to SidebarRowButton", () => {
    assert.match(source, /affordance=\{item\.affordance\}/);
  });

  it("does not manufacture an affordance when the item has none", () => {
    assert.doesNotMatch(source, /affordance \?\?/);
  });
});

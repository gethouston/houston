import { equal } from "node:assert";
import { describe, it } from "node:test";
import {
  RAIL_INTERACTIVE_SELECTOR,
  type RailClickTarget,
  shouldExpandFromRailClick,
} from "../src/sidebar-rail-expand.ts";

function targetInside(...tags: string[]): RailClickTarget {
  return {
    closest(selector: string) {
      const wanted = selector.split(",").map((s) => s.trim());
      return tags.some((t) => wanted.includes(t)) ? {} : null;
    },
  };
}

describe("collapsed rail click-to-expand guard", () => {
  it("expands on clicks over non-interactive rail area", () => {
    equal(shouldExpandFromRailClick(targetInside("div")), true);
    equal(shouldExpandFromRailClick(targetInside("aside")), true);
    equal(shouldExpandFromRailClick(null), true);
  });

  it("does not steal clicks from interactive elements", () => {
    equal(shouldExpandFromRailClick(targetInside("button")), false);
    equal(shouldExpandFromRailClick(targetInside("a")), false);
    equal(shouldExpandFromRailClick(targetInside("input")), false);
    equal(shouldExpandFromRailClick(targetInside("[role='menuitem']")), false);
    equal(
      shouldExpandFromRailClick(targetInside("[data-rail-no-expand]")),
      false,
    );
  });

  it("covers the affordances that live on the rail today", () => {
    // Agent items, nav items, add-agent, user menu, and the monogram/expand
    // button all render as <button>; dropdown menus render role=menuitem.
    for (const sel of ["button", "[role='menuitem']"]) {
      equal(RAIL_INTERACTIVE_SELECTOR.includes(sel), true);
    }
  });
});

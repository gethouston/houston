import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  sidebarClasses,
  sidebarItemRowClasses,
} from "../src/sidebar-classes.ts";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function includes(className: string, token: string): boolean {
  return tokens(className).has(token);
}

describe("sidebar item row layout", () => {
  it("constrains long names before trailing controls", () => {
    ok(includes(sidebarItemRowClasses.root, "min-w-0"));
    ok(includes(sidebarItemRowClasses.root, "w-full"));
    ok(includes(sidebarItemRowClasses.selectButton, "min-w-0"));
    ok(includes(sidebarItemRowClasses.selectButton, "flex-1"));
    ok(includes(sidebarItemRowClasses.name, "min-w-0"));
    ok(includes(sidebarItemRowClasses.name, "flex-1"));
    ok(includes(sidebarItemRowClasses.name, "truncate"));
    ok(includes(sidebarItemRowClasses.actions, "shrink-0"));
    ok(includes(sidebarClasses.itemsList, "w-0"));
    ok(includes(sidebarClasses.itemsList, "min-w-full"));
  });

  it("keeps menu trigger in its own visible slot", () => {
    ok(includes(sidebarItemRowClasses.menuButton, "size-7"));
    ok(includes(sidebarItemRowClasses.menuButton, "shrink-0"));
    ok(includes(sidebarItemRowClasses.menuButton, "opacity-0"));
    ok(includes(sidebarItemRowClasses.menuButton, "group-hover:opacity-100"));
    ok(
      includes(
        sidebarItemRowClasses.menuButton,
        "group-focus-within:opacity-100",
      ),
    );
    ok(
      includes(sidebarItemRowClasses.trailingWithMenu, "group-hover:opacity-0"),
    );
    ok(includes(sidebarItemRowClasses.trailingMenuOpen, "opacity-0"));
  });
});

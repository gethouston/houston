import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  sidebarClasses,
  sidebarGroupClasses,
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
    strictEqual(includes(sidebarItemRowClasses.menuButton, "opacity-0"), false);
    strictEqual(
      includes(sidebarItemRowClasses.menuButton, "pointer-events-none"),
      false,
    );
    ok(includes(sidebarItemRowClasses.menuButton, "text-ink-muted/50"));
    strictEqual(includes(sidebarItemRowClasses.trailing, "absolute"), false);
    strictEqual(includes(sidebarItemRowClasses.actions, "size-7"), false);
    ok(includes(sidebarItemRowClasses.actions, "gap-1"));
  });

  it("keeps the group menu visible and quiet", () => {
    strictEqual(includes(sidebarGroupClasses.menuButton, "opacity-0"), false);
    strictEqual(
      includes(sidebarGroupClasses.menuButton, "group-hover/gh:opacity-100"),
      false,
    );
    ok(includes(sidebarGroupClasses.menuButton, "text-ink-muted/60"));
    strictEqual(includes(sidebarGroupClasses.menuButton, "absolute"), false);
  });
});

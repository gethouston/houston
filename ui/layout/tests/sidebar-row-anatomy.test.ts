import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  sidebarClasses,
  sidebarGroupClasses,
  sidebarItemRowClasses,
  sidebarRowGeometry,
  sidebarSectionRowClasses,
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

  it("lines section rows up with the item rows below them", () => {
    // Same left padding, same gap, same type size — a glyph column that breaks
    // between a destination row and an agent row reads as two lists, not one.
    // The shared geometry is the contract; both rows must wear all of it.
    for (const token of tokens(sidebarRowGeometry)) {
      ok(includes(sidebarSectionRowClasses.root, token), token);
      ok(includes(sidebarItemRowClasses.selectButton, token), token);
    }
    ok(includes(sidebarSectionRowClasses.root, "min-w-0"));
    ok(includes(sidebarSectionRowClasses.label, "truncate"));
    ok(includes(sidebarSectionRowClasses.icon, "shrink-0"));
    // A 20px glyph box — the width the agent rows' avatar occupies — so both
    // kinds of row share one glyph column and one label column.
    ok(includes(sidebarSectionRowClasses.icon, "size-5"));
    // Never a pinned colour: a selected row's glyph brightens with its label.
    strictEqual(
      includes(sidebarSectionRowClasses.icon, "text-ink-muted"),
      false,
    );
  });

  it("promises nothing on the default block's header", () => {
    // It is a label for the container itself: no fold, no rename, no menu. A
    // hover fill would advertise a click that does nothing.
    strictEqual(
      includes(sidebarGroupClasses.staticHeader, "hover:bg-hover/40"),
      false,
    );
    strictEqual(includes(sidebarGroupClasses.staticHeader, "group/gh"), false);
    // Its name still sits on the group names' optical column (caret-sized gap).
    ok(includes(sidebarGroupClasses.caretSpacer, "size-4"));
    // Each static piece IS the base a real group header builds on: every token
    // of the static twin must reappear in the affordance-carrying one, so the
    // two families can only differ by the affordances themselves.
    for (const token of tokens(sidebarGroupClasses.staticHeader)) {
      ok(includes(sidebarGroupClasses.header, token), token);
    }
    for (const token of tokens(sidebarGroupClasses.staticName)) {
      ok(includes(sidebarGroupClasses.name, token), token);
    }
    for (const token of tokens(sidebarGroupClasses.staticCount)) {
      ok(includes(sidebarGroupClasses.count, token), token);
    }
    // The count never fades out — there is no menu to reveal underneath it.
    strictEqual(
      includes(sidebarGroupClasses.staticCount, "group-hover/gh:opacity-0"),
      false,
    );
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  FLOATING_NAV_ACTION_CLASSES,
  FLOATING_NAV_PILL_CLASSES,
  floatingNavItemClasses,
} from "../src/components/floating-nav-bar-styles.ts";

describe("floatingNavItemClasses", () => {
  it("fills only the active item, and only it carries a label's padding", () => {
    const active = floatingNavItemClasses(true);
    assert.ok(active.includes("bg-tab-active"));
    assert.ok(active.includes("text-ink"));
    assert.ok(active.includes("px-4"));
  });

  it("leaves an inactive item as a muted glyph with no fill", () => {
    const inactive = floatingNavItemClasses(false);
    assert.ok(!inactive.includes("bg-tab-active"));
    assert.ok(inactive.includes("text-ink-muted"));
    // Icon-only, so the target has to be squared up to stay tappable.
    assert.ok(inactive.includes("min-w-11"));
  });

  it("keeps every item a ≥44px target with press feedback and a focus ring", () => {
    for (const classes of [
      floatingNavItemClasses(true),
      floatingNavItemClasses(false),
    ]) {
      assert.ok(classes.includes("min-h-11"));
      assert.ok(classes.includes("active:scale-[0.96]"));
      assert.ok(classes.includes("focus-visible:ring-focus"));
      assert.ok(classes.includes("rounded-full"));
    }
  });
});

describe("the bar's surfaces", () => {
  it("draws the pill and the action button as one recessed family", () => {
    for (const classes of [
      FLOATING_NAV_PILL_CLASSES,
      FLOATING_NAV_ACTION_CLASSES,
    ]) {
      assert.ok(classes.includes("rounded-full"));
      assert.ok(classes.includes("bg-chip"));
      // Depth is the hairline ring, never a drop shadow (dark mode has none).
      assert.ok(classes.includes("ht-hairline"));
      assert.ok(!classes.includes("shadow"));
    }
  });

  it("gives the action its own round target beside the pill", () => {
    assert.ok(FLOATING_NAV_ACTION_CLASSES.includes("size-14"));
    assert.ok(FLOATING_NAV_ACTION_CLASSES.includes("shrink-0"));
    assert.ok(FLOATING_NAV_PILL_CLASSES.includes("flex-1"));
  });
});

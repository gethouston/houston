import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import {
  HEADER_HEIGHT,
  headerCollapsesTabs,
  headerHoldsTools,
  headerMode,
} from "../src/components/shell/page-header/page-header-layout.ts";

describe("headerMode", () => {
  const thresholds = { oneRowMin: 1000 };

  it("renders the safe stacked form before measurement", () => {
    assert.equal(headerMode(null, thresholds), "stacked");
  });

  it("uses exact boundary values", () => {
    assert.equal(headerMode(1000, thresholds), "full");
    assert.equal(headerMode(999, thresholds), "stacked");
  });
});

describe("header mode semantics", () => {
  it("keeps tools in the strip only while the whole row fits", () => {
    assert.deepEqual((["full", "stacked"] as const).map(headerHoldsTools), [
      true,
      false,
    ]);
  });

  /**
   * The rule Julian asked for: a chat panel opening beside the board narrows
   * the strip, and what leaves is the tools — the lozenges a user navigates by
   * stay drawn. Only the phone, which has no second row to give them, folds
   * them into the identity menu.
   */
  it("never collapses the desktop cluster, at any width", () => {
    assert.deepEqual(
      (["full", "stacked"] as const).map((mode) =>
        headerCollapsesTabs(mode, false),
      ),
      [false, false],
    );
  });

  it("collapses the phone cluster below the strip's one-row width", () => {
    assert.equal(headerCollapsesTabs("stacked", true), true);
    assert.equal(headerCollapsesTabs("full", true), false);
  });

  it("declares the strip height once", () => {
    assert.equal(HEADER_HEIGHT, "h-12");
  });
});

/**
 * ONE rule, in one place. A header that reached for `headerCollapsesTabs`
 * itself would have to remember the phone fork, and the screen that forgot it
 * would trade its sections for a menu the moment a panel opened beside it.
 */
describe("the collapse rule has a single caller", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  };
  const files = walk(SRC).map((file) => ({
    path: relative(SRC, file),
    source: readFileSync(file, "utf8"),
  }));

  it("is read through the hook, never called by a screen", () => {
    assert.deepEqual(
      files
        .filter((file) => file.source.includes("headerCollapsesTabs"))
        .map((file) => file.path)
        .sort(),
      [
        join("components", "shell", "page-header", "page-header-layout.ts"),
        join("components", "shell", "page-header", "page-header-tools.tsx"),
      ].sort(),
    );
  });

  it("gates every switcher a screen draws", () => {
    for (const file of files) {
      if (!file.source.includes("<PageHeaderSwitcher")) continue;
      assert.match(
        file.source,
        /usePageHeaderTabsCollapsed\(\)/,
        `${file.path} draws the switcher without the shared rule`,
      );
    }
  });
});

/**
 * The strip's back slot: a drilled page wears ONE top row — back, identity,
 * tools — instead of a back bar stacked over its own header. Guarded on source
 * because the node runner has no DOM (the repo's React-test idiom).
 */
describe("the page header's back slot", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const header = read("../src/components/shell/page-header/page-header.tsx");
  const control = read("../src/components/shell/back-control.tsx");

  it("leads the strip, before the identity cluster", () => {
    assert.match(
      header,
      /\{back && <BackControl label=\{back\.label\} onClick=\{back\.onClick\} \/>\}\s*<div className="flex min-w-0 items-center overflow-x-auto">/,
    );
  });

  it("is optional, so an undrilled page is unchanged", () => {
    assert.match(header, /back\?: BackTarget;/);
  });

  it("shares ONE control with the back bar, so the two cannot drift", () => {
    assert.match(
      read("../src/components/shell/back-bar-screen.tsx"),
      /import \{ BackControl \} from "\.\/back-control";/,
    );
    assert.match(header, /import \{ BackControl, type BackTarget \}/);
  });

  it("keeps the chip inside the strip's height, and on screen", () => {
    // 40px stands in the 48px strip; `shrink-0` keeps the way back from being
    // squeezed out by the cluster scrolling beside it.
    assert.match(control, /default:\s+"size-10 /);
    assert.match(control, /inline-flex shrink-0/);
  });
});

/**
 * The collapsed form of the identity cluster. A page whose strip has folded its
 * lozenges into a menu is the SAME page, so it must still say which one it is:
 * the h1 names the screen and the control a user says out loud is the one voice
 * control activates (WCAG 2.5.3, Label in Name). Guarded on source because the
 * node runner has no DOM (the repo's React-test idiom).
 */
describe("the page header's identity switcher", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const switcher = read(
    "../src/components/shell/page-header/page-header-switcher.tsx",
  );

  it("names the trigger from the identity it shows, never from the menu", () => {
    // An `aria-label` on the trigger would override BOTH: the h1 would answer
    // "Integration sections" where the page is Integrations, and the visible
    // label would stop being part of the control's accessible name.
    assert.match(
      switcher,
      /<h1 className=\{headerLozengeTrack\("min-w-0"\)\}>/,
    );
    assert.doesNotMatch(switcher, /<DropdownMenuTrigger\s+aria-label=/);
  });

  it("gives the menu itself the cluster's name", () => {
    assert.match(switcher, /<DropdownMenuContent aria-label=\{label\}/);
  });
});

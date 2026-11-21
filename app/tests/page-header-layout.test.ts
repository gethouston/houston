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
    assert.match(control, /default:\s+"size-10 /);
    assert.match(control, /inline-flex shrink-0/);
  });
});

describe("the page header's identity switcher", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const switcher = read(
    "../src/components/shell/page-header/page-header-switcher.tsx",
  );

  it("names the trigger from the identity it shows, never from the menu", () => {
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

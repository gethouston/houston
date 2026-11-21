import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const src = readFileSync(
  new URL(
    "../src/components/settings/sections/appearance.tsx",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("the Appearance row's preference", () => {
  it("seeds the row from the preference already in force", () => {
    assert.match(src, /useState<ThemePreference>\(currentThemePreference\)/);
  });

  it("writes through the committer, so a burst of picks stores once", () => {
    assert.match(src, /createAppearanceCommitter\(saved, setPref/);
    assert.match(
      src,
      /persist: persistThemePreference/,
      "the committer owns the screen, so its write seam must be the one that paints nothing",
    );
  });

  it("builds that committer from the SAVED preference, not from the defaults", () => {
    assert.match(src, /themeReady\(\)\.then\(\(saved\) =>/);
    assert.match(
      src,
      /if \(!live \|\| saved === null\) return;/,
      "a failed read leaves what is saved unknown, so the controls stay closed",
    );
    assert.match(
      src,
      /disabled=\{committer === null\}/,
      "no pick can be taken before the preference it would be diffed against is known",
    );
  });

  it("never reads the preference again as it mounts", () => {
    assert.doesNotMatch(
      src,
      /loadThemePreference/,
      "the boot read applies, mirrors and releases the window; the row only reads",
    );
  });

  it("disposes the committer on unmount and on unload, so the last pick still lands", () => {
    assert.match(src, /const flush = \(\) => built\?\.dispose\(\);/);
    assert.match(src, /window\.addEventListener\("pagehide", flush\)/);
    assert.match(
      src,
      /return \(\) => \{\s*live = false;\s*window\.removeEventListener\("pagehide", flush\);\s*flush\(\);/,
    );
  });
});

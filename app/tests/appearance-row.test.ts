import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The Appearance row READS the preference in force; it never re-reads it.
 *
 * `loadThemePreference()` is the boot path, and it is a side-effecting getter:
 * it applies what it read, rewrites the device mirror, re-releases the native
 * window under `system`, and answers null when the READ itself failed. Calling
 * it again as the row mounts repeats all three, and on a failed read leaves the
 * row on the documented defaults while the app stays painted with the real
 * picks, so the next pick would persist a combination nobody chose. The row
 * shows `currentThemePreference()` instead, which is synchronous and is exactly
 * what the boot read put in force, and it WAITS on `themeReady()` before it can
 * write anything: the boot read is a round trip, and a row that mounted while it
 * was still in flight must not diff a pick against the defaults.
 *
 * The row imports `@houston-ai/core` and `react-i18next`, which only the bundler
 * resolves, so this asserts on source text (the same reason
 * `os-bridge-barrel.test.ts` reads source) with comments stripped, so a comment
 * can never satisfy it.
 */
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

  it("disposes the committer on unmount, so the last pick still lands", () => {
    // The cleanup is the ONE thing the mount effect exists for besides waiting
    // on the read: closing Settings inside the debounce window would otherwise
    // drop the pick the user just made.
    assert.match(
      src,
      /return \(\) => \{\s*live = false;\s*built\?\.dispose\(\);/,
    );
  });
});

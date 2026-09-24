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
 * picks — so the next pick would persist a combination nobody chose. The row
 * seeds from `currentThemePreference()` instead, which is synchronous and is
 * exactly what the boot read already put in force.
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
    assert.match(src, /createAppearanceCommitter\(/);
    assert.doesNotMatch(
      src,
      /void setThemePreference\(/,
      "the debounce, both mirrors and the revert live in the committer",
    );
  });

  it("never reads the preference again as it mounts", () => {
    assert.doesNotMatch(
      src,
      /loadThemePreference/,
      "the boot read applies, mirrors and releases the window; the row only reads",
    );
    assert.doesNotMatch(
      src,
      /useEffect/,
      "no mount effect at all: there is nothing left for one to fetch",
    );
  });
});

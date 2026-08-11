import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
// The five generated shelves directly, not their barrel: the barrel's imports
// are extensionless (the bundler's convention in `ui/`), which node's own ESM
// loader cannot resolve.
import { SIDEBAR_GROUP_GLYPHS_1 } from "../../ui/layout/src/sidebar-group-glyph-data-1.ts";
import { SIDEBAR_GROUP_GLYPHS_2 } from "../../ui/layout/src/sidebar-group-glyph-data-2.ts";
import { SIDEBAR_GROUP_GLYPHS_3 } from "../../ui/layout/src/sidebar-group-glyph-data-3.ts";
import { SIDEBAR_GROUP_GLYPHS_4 } from "../../ui/layout/src/sidebar-group-glyph-data-4.ts";
import { SIDEBAR_GROUP_GLYPHS_5 } from "../../ui/layout/src/sidebar-group-glyph-data-5.ts";
import en from "../src/locales/en/shell.json" with { type: "json" };
import es from "../src/locales/es/shell.json" with { type: "json" };
import pt from "../src/locales/pt/shell.json" with { type: "json" };

// Every mark in the team identity picker is NAMED aloud: its label is the
// button's `aria-label`, its `title`, and (since the picker also searches the
// label) the word a Spanish or Portuguese reader types to find it. The label
// comes from `shell:sidebar.teamIcons.<name>`, and a template-literal key is
// NOT checked by the react-i18next type augmentation, so a missing key would
// ship the raw slug into an aria-label instead of failing the build. This is
// the check that makes the icon set and the three locales move together.

const NAMES = [
  SIDEBAR_GROUP_GLYPHS_1,
  SIDEBAR_GROUP_GLYPHS_2,
  SIDEBAR_GROUP_GLYPHS_3,
  SIDEBAR_GROUP_GLYPHS_4,
  SIDEBAR_GROUP_GLYPHS_5,
].flatMap((shelf) => Object.keys(shelf));
const LOCALES = { en, es, pt } as const;

describe("team icon labels", () => {
  for (const [lang, bundle] of Object.entries(LOCALES)) {
    const labels = (
      bundle as { sidebar: { teamIcons: Record<string, string> } }
    ).sidebar.teamIcons;

    it(`${lang}: names every glyph and nothing else`, () => {
      for (const name of NAMES) {
        const label = labels[name];
        ok(
          typeof label === "string" && label.trim().length > 0,
          `${lang}: sidebar.teamIcons.${name} is missing`,
        );
      }
      strictEqual(
        Object.keys(labels)
          .filter((key) => !NAMES.includes(key))
          .join(", "),
        "",
        `${lang}: sidebar.teamIcons names icons that no longer exist`,
      );
    });

    it(`${lang}: gives each glyph a distinct label`, () => {
      // Two grid buttons announcing the same name are indistinguishable to a
      // screen reader, and ambiguous to anyone reading the tooltip.
      const seen = new Set<string>();
      for (const name of NAMES) {
        const label = labels[name].toLocaleLowerCase();
        ok(!seen.has(label), `${lang}: "${labels[name]}" is used twice`);
        seen.add(label);
      }
    });
  }
});

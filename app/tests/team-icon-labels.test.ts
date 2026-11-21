import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { SIDEBAR_GROUP_GLYPHS_1 } from "../../ui/layout/src/sidebar-group-glyph-data-1.ts";
import { SIDEBAR_GROUP_GLYPHS_2 } from "../../ui/layout/src/sidebar-group-glyph-data-2.ts";
import { SIDEBAR_GROUP_GLYPHS_3 } from "../../ui/layout/src/sidebar-group-glyph-data-3.ts";
import { SIDEBAR_GROUP_GLYPHS_4 } from "../../ui/layout/src/sidebar-group-glyph-data-4.ts";
import { SIDEBAR_GROUP_GLYPHS_5 } from "../../ui/layout/src/sidebar-group-glyph-data-5.ts";
import en from "../src/locales/en/shell.json" with { type: "json" };
import es from "../src/locales/es/shell.json" with { type: "json" };
import pt from "../src/locales/pt/shell.json" with { type: "json" };

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
      const seen = new Set<string>();
      for (const name of NAMES) {
        const label = labels[name].toLocaleLowerCase();
        ok(!seen.has(label), `${lang}: "${labels[name]}" is used twice`);
        seen.add(label);
      }
    });
  }
});

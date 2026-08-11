import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSymbols } from "../../../scripts/generate-team-icons.mjs";
import { matchesSidebarGroupGlyph } from "../src/sidebar-group-glyph-search.ts";
import { SIDEBAR_GROUP_GLYPH_TAGS } from "../src/sidebar-group-glyph-tags.ts";
import {
  isSidebarGroupGlyph,
  resolveSidebarGroupGlyph,
  SIDEBAR_GROUP_GLYPH_NAMES,
  SIDEBAR_GROUP_GLYPHS,
  SidebarGroupGlyph,
} from "../src/sidebar-group-glyphs.tsx";

describe("team icon generation", () => {
  it("parses multi-element symbols and strips pinned fills", () => {
    const [glyph] = parseSymbols(
      '<symbol id="AlarmClock" viewBox="0 0 16 16"><path fill="#000" fill-rule="evenodd" d="M0 0"/><circle fill="red" cx="8" cy="8" r="2"/></symbol>',
    );
    assert.deepEqual(glyph, {
      key: "alarm-clock",
      viewBox: "0 0 16 16",
      body: '<path fill-rule="evenodd" d="M0 0"/>\n<circle cx="8" cy="8" r="2"/>',
    });
  });

  it("refuses markup outside the drawing allowlist", () => {
    assert.throws(
      () =>
        parseSymbols(
          '<symbol id="Bad" viewBox="0 0 16 16"><script>alert(1)</script></symbol>',
        ),
      /Symbol "Bad": <script> is not a drawing element/,
    );
    assert.throws(
      () =>
        parseSymbols(
          '<symbol id="Bad" viewBox="0 0 16 16"><path onclick="alert(1)" d="M0 0"/></symbol>',
        ),
      /Symbol "Bad": attribute "onclick" is not allowed/,
    );
  });

  it("ships all generated source icons on their 16px viewBox", () => {
    assert.equal(SIDEBAR_GROUP_GLYPH_NAMES.length, 233);
    for (const glyph of Object.values(SIDEBAR_GROUP_GLYPHS)) {
      assert.equal(glyph.viewBox, "0 0 16 16");
      assert.doesNotMatch(glyph.body, /\sfill=/i);
    }
  });

  it("keeps multi-path markup and currentColor rendering", () => {
    assert.ok(
      SIDEBAR_GROUP_GLYPHS["bar-graph"].body.match(/<path/g)?.length === 2,
    );
    const markup = renderToStaticMarkup(
      createElement(SidebarGroupGlyph, { name: "bar-graph" }),
    );
    assert.match(markup, /viewBox="0 0 16 16"/);
    assert.match(markup, /fill="currentColor"/);
    assert.equal((markup.match(/<path/g) ?? []).length, 2);
  });
});

describe("stored team icon keys", () => {
  it("resolves direct and legacy keys and degrades unknown keys", () => {
    assert.equal(resolveSidebarGroupGlyph("rocket"), "rocket");
    assert.equal(resolveSidebarGroupGlyph("star"), "starred");
    assert.equal(resolveSidebarGroupGlyph("not-a-glyph"), undefined);
    assert.equal(isSidebarGroupGlyph("rocket"), true);
    assert.equal(isSidebarGroupGlyph("star"), true);
    assert.equal(isSidebarGroupGlyph("not-a-glyph"), false);
    assert.equal(
      renderToStaticMarkup(
        createElement(SidebarGroupGlyph, { name: "not-a-glyph" }),
      ),
      "",
    );
  });
});

describe("team icon search", () => {
  it("matches name words, curated tags, and casing", () => {
    assert.equal(matchesSidebarGroupGlyph("alarm-clock", "clock"), true);
    assert.equal(matchesSidebarGroupGlyph("users", "TEAM"), true);
    assert.equal(matchesSidebarGroupGlyph("bank", "MoNeY"), true);
    assert.equal(matchesSidebarGroupGlyph("rocket", "money"), false);
  });

  it("matches a caller's localized name, accents ignored either way", () => {
    assert.equal(
      matchesSidebarGroupGlyph("dollar-bill", "dolar", "Billete de dólar"),
      true,
    );
    assert.equal(
      matchesSidebarGroupGlyph("dollar-bill", "dólar", "Billete de dolar"),
      true,
    );
    assert.equal(
      matchesSidebarGroupGlyph("dollar-bill", "BILLETE", "Billete de dólar"),
      true,
    );
    assert.equal(
      matchesSidebarGroupGlyph("rocket", "billete", "Cohete"),
      false,
    );
  });

  it("makes money surface the complete requested finance set", () => {
    const matches = SIDEBAR_GROUP_GLYPH_NAMES.filter((name) =>
      matchesSidebarGroupGlyph(name, "money"),
    );
    for (const name of [
      "bank",
      "dollar",
      "euro",
      "dollar-bill",
      "money-stack",
    ] as const) {
      assert.ok(matches.includes(name), name);
    }
  });

  it("gives every icon at least two non-name tags", () => {
    for (const name of SIDEBAR_GROUP_GLYPH_NAMES) {
      assert.ok(SIDEBAR_GROUP_GLYPH_TAGS[name].length >= 2, name);
      for (const tag of SIDEBAR_GROUP_GLYPH_TAGS[name]) {
        assert.equal(name.split("-").includes(tag), false, `${name}: ${tag}`);
      }
    }
  });
});

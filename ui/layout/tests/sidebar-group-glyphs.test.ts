import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSymbols } from "../../../scripts/generate-team-icons.mjs";
import {
  matchesSidebarGroupGlyph,
  SIDEBAR_GROUP_GLYPH_CONCEPT_VOCABULARY,
  sidebarGroupGlyphConcepts,
} from "../src/sidebar-group-glyph-search.ts";
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

  it("reads a namespaced name whole, so it cannot pass as an allowed one", () => {
    // `xlink:href` is how a drawing element loads and runs remote markup, and
    // an attribute scanner that stops at the colon would judge "href" instead.
    assert.throws(
      () =>
        parseSymbols(
          '<symbol id="Bad" viewBox="0 0 16 16"><path xlink:href="https://evil.test/x.svg" d="M0 0"/></symbol>',
        ),
      /Symbol "Bad": attribute "xlink:href" is not allowed/,
    );
    assert.throws(
      () =>
        parseSymbols(
          '<symbol id="Bad" viewBox="0 0 16 16"><path xml:space="preserve" d="M0 0"/></symbol>',
        ),
      /Symbol "Bad": attribute "xml:space" is not allowed/,
    );
    assert.throws(
      () =>
        parseSymbols(
          '<symbol id="Bad" viewBox="0 0 16 16"><svg:script>alert(1)</svg:script></symbol>',
        ),
      /Symbol "Bad": <svg:script> is not a drawing element/,
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

  it("searches EVERY extra haystack, not just the first", () => {
    // The picker passes two: the mark's localized name and its localized
    // concepts (this package's English tags, translated app-side). A matcher
    // that only read the first would silently drop the concept vocabulary.
    const label = "Cohete";
    const concepts = "espacio lanzamiento futuro";
    assert.equal(
      matchesSidebarGroupGlyph("rocket", "lanzamiento", label, concepts),
      true,
    );
    assert.equal(matchesSidebarGroupGlyph("rocket", "cohete", label, ""), true);
    assert.equal(
      matchesSidebarGroupGlyph("rocket", "dinero", label, concepts),
      false,
    );
  });

  it("offers a mark's concepts for translation, name words included", () => {
    // The generator drops a word from a mark's tags when the NAME already
    // carries it, so tags alone would leave a translator no way to say the one
    // concept the mark is named after.
    assert.equal(
      SIDEBAR_GROUP_GLYPH_TAGS["money-stack"].includes("money"),
      false,
    );
    assert.ok(sidebarGroupGlyphConcepts("money-stack").includes("money"));
    // "stack" is nobody's curated concept, so there is nothing to translate.
    assert.equal(
      sidebarGroupGlyphConcepts("money-stack").includes("stack"),
      false,
    );
    // Never the same word twice: the consumer translates this list key by key,
    // and a repeat would pay for the same lookup again.
    const home = sidebarGroupGlyphConcepts("home");
    assert.equal(home.length, new Set(home).size);
    // "home" is the mark's name AND a tag other marks carry, so it is offered.
    assert.ok(home.includes("home"));
  });

  it("draws every concept from ONE closed vocabulary", () => {
    // The app translates that vocabulary key by key: a concept outside it
    // would search as an untranslated English word in a Spanish picker.
    for (const name of SIDEBAR_GROUP_GLYPH_NAMES) {
      for (const concept of sidebarGroupGlyphConcepts(name)) {
        assert.ok(
          SIDEBAR_GROUP_GLYPH_CONCEPT_VOCABULARY.has(concept),
          `${name}: ${concept}`,
        );
      }
    }
  });

  it("spends the whole vocabulary: no word waits for a translation nobody reads", () => {
    // A word here but on no mark would still be a key the app must translate,
    // in three locales, for a search that can never surface anything.
    const offered = new Set(
      SIDEBAR_GROUP_GLYPH_NAMES.flatMap((name) =>
        sidebarGroupGlyphConcepts(name),
      ),
    );
    const unused = [...SIDEBAR_GROUP_GLYPH_CONCEPT_VOCABULARY].filter(
      (word) => !offered.has(word),
    );
    assert.deepEqual(unused, []);
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

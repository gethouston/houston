import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  isSidebarGroupGlyph,
  SIDEBAR_GROUP_GLYPH_NAMES,
  SIDEBAR_GROUP_GLYPHS,
  SidebarGroupGlyph,
} from "../src/sidebar-group-glyphs.tsx";

// The module is TSX; node's type stripping does not transform JSX, so the
// specimens under test are built with createElement (the ui/store pattern).

/** The gateway's shape for a stored glyph name. */
const NAME = /^[a-z0-9-]{1,32}$/;

describe("sidebar group glyphs", () => {
  it("offers exactly 56 marks, each on a name the gateway can store", () => {
    // 56 fills the picker's 8-column grid seven rows deep with no ragged last
    // row, and every mark in it still reads at 14px. The names are what a group
    // PERSISTS, so they are constrained to the shape the gateway accepts rather
    // than to whatever reads nicely here.
    assert.equal(SIDEBAR_GROUP_GLYPH_NAMES.length, 56);
    assert.equal(Object.keys(SIDEBAR_GROUP_GLYPHS).length, 56);
    assert.equal(new Set(SIDEBAR_GROUP_GLYPH_NAMES).size, 56);
    for (const name of SIDEBAR_GROUP_GLYPH_NAMES) {
      assert.match(name, NAME);
    }
  });

  it("gives every mark a path, and no mark a colour of its own", () => {
    // A row's glyph inherits its label's ink (sidebar-paint, invariant 3): a
    // fill baked into a path is how a selected row brightens everywhere except
    // its own mark.
    for (const name of SIDEBAR_GROUP_GLYPH_NAMES) {
      const d = SIDEBAR_GROUP_GLYPHS[name];
      assert.ok(d.length > 0, name);
      // Path data and nothing else: no colour, no second attribute smuggled in.
      assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz\d\s,.-]+$/, name);
      // Solid, not stroked: every mark is one or more CLOSED subpaths.
      assert.match(d, /[Zz]$/, name);
    }
  });

  it("pins the 56 KEYS, because a group's chosen mark is stored by name", () => {
    // The stored `icon` string is one of these. Renaming a key silently swaps
    // the mark under every group that already picked it, so the set is spelled
    // out here rather than derived from the module it is guarding. The order is
    // the picker's grid order: runs of eight, one theme per row.
    assert.deepEqual(
      [...SIDEBAR_GROUP_GLYPH_NAMES],
      [
        "people",
        "person",
        "home",
        "briefcase",
        "calendar",
        "clipboard",
        "folder",
        "document",
        "mail",
        "phone",
        "chat",
        "megaphone",
        "camera",
        "music",
        "headset",
        "gamepad",
        "code",
        "terminal",
        "server",
        "cloud",
        "key",
        "gear",
        "chart",
        "bug",
        "wrench",
        "hammer",
        "flask",
        "bulb",
        "cube",
        "gem",
        "ribbon",
        "trophy",
        "cart",
        "card",
        "shield",
        "bandage",
        "barbell",
        "cutlery",
        "coffee",
        "book",
        "leaf",
        "flame",
        "bolt",
        "star",
        "heart",
        "paw",
        "planet",
        "globe",
        "rocket",
        "plane",
        "car",
        "boat",
        "telescope",
        "flag",
        "target",
        "school",
      ],
    );
  });

  it("rejects a name that is not in the set", () => {
    // Stored identities outlive the set that produced them, so a retired or
    // hand-edited name has to resolve to "no mark", never to a thrown render.
    assert.equal(isSidebarGroupGlyph("book"), true);
    assert.equal(isSidebarGroupGlyph("not-a-glyph"), false);
    assert.equal(isSidebarGroupGlyph(undefined), false);
    assert.equal(isSidebarGroupGlyph(""), false);
    // And nothing off Object.prototype counts as a mark.
    assert.equal(isSidebarGroupGlyph("toString"), false);
    assert.equal(isSidebarGroupGlyph("constructor"), false);
  });

  it("fills every mark with the ROW's ink and hides it from the reader", () => {
    for (const name of SIDEBAR_GROUP_GLYPH_NAMES) {
      const html = renderToStaticMarkup(
        createElement(SidebarGroupGlyph, { name, className: "size-4" }),
      );
      assert.match(html, /fill="currentColor"/, name);
      // Ionicons' OWN 512-unit box, kept verbatim: the viewBox is an
      // internal coordinate system (the row sizes the mark with a class), and
      // rescaling every coordinate by hand is what makes a set look home-made.
      assert.match(html, /viewBox="0 0 512 512"/, name);
      assert.match(html, /aria-hidden="true"/, name);
      assert.match(html, /class="size-4"/, name);
      assert.match(html, /<path d="/, name);
    }
  });

  it("renders NOTHING for an unknown name, leaving the fallback to the host", () => {
    // Only the host knows what a group with no usable mark should show. A
    // placeholder decided in the library would be a second fallback competing
    // with the host's.
    for (const name of ["not-a-glyph", "", "toString"]) {
      assert.equal(
        renderToStaticMarkup(createElement(SidebarGroupGlyph, { name })),
        "",
        name,
      );
    }
  });
});

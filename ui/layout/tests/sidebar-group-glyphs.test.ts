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
  it("offers exactly 251 marks, each on a name the gateway can store", () => {
    // 251 marks scroll behind the pickers' 8-column grids in themed runs, and
    // every mark still reads at 14px. The names are what a group PERSISTS, so
    // they are constrained to the shape the gateway accepts rather than to
    // whatever reads nicely here.
    assert.equal(SIDEBAR_GROUP_GLYPH_NAMES.length, 251);
    assert.equal(Object.keys(SIDEBAR_GROUP_GLYPHS).length, 251);
    assert.equal(new Set(SIDEBAR_GROUP_GLYPH_NAMES).size, 251);
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

  it("pins the 251 KEYS, because a group's chosen mark is stored by name", () => {
    // The stored `icon` string is one of these. Renaming a key silently swaps
    // the mark under every group that already picked it, so the set is spelled
    // out here rather than derived from the module it is guarding. The order is
    // the picker's grid order: runs of eight, one theme per row.
    assert.deepEqual(
      [...SIDEBAR_GROUP_GLYPH_NAMES],
      [
        "people",
        "person",
        "person-add",
        "person-remove",
        "person-circle",
        "people-circle",
        "man",
        "woman",
        "male",
        "female",
        "male-female",
        "transgender",
        "body",
        "accessibility",
        "shirt",
        "footsteps",
        "finger-print",
        "id-card",
        "glasses",
        "ear",
        "eye",
        "eye-off",
        "happy",
        "sad",
        "thumbs-up",
        "thumbs-down",
        "hand-left",
        "hand-right",
        "chat",
        "chatbubbles",
        "chatbox",
        "chatbox-ellipses",
        "chatbubble-ellipses",
        "mail",
        "mail-open",
        "mail-unread",
        "paper-plane",
        "send",
        "at",
        "phone",
        "megaphone",
        "notifications",
        "recording",
        "help-circle",
        "videocam",
        "camera",
        "radio",
        "share-social",
        "share",
        "infinite",
        "wifi",
        "headset",
        "cart",
        "storefront",
        "bag",
        "bag-handle",
        "basket",
        "pricetag",
        "pricetags",
        "receipt",
        "cash",
        "card",
        "wallet",
        "ticket",
        "gift",
        "bag-check",
        "qr-code",
        "business",
        "cellular",
        "bag-add",
        "calculator",
        "scale",
        "podium",
        "medal",
        "trophy",
        "ribbon",
        "chart",
        "analytics",
        "stats-chart",
        "pie-chart",
        "speedometer",
        "pulse",
        "funnel",
        "filter",
        "checkbox",
        "checkmark-done-circle",
        "grid",
        "layers",
        "extension-puzzle",
        "target",
        "calendar",
        "calendar-number",
        "calendar-clear",
        "today",
        "time",
        "timer",
        "stopwatch",
        "alarm",
        "hourglass",
        "watch",
        "flag",
        "pin",
        "location",
        "map",
        "navigate",
        "compass",
        "trail-sign",
        "briefcase",
        "clipboard",
        "document",
        "documents",
        "document-text",
        "document-attach",
        "document-lock",
        "folder",
        "folder-open",
        "file-tray",
        "file-tray-full",
        "file-tray-stacked",
        "archive",
        "albums",
        "cloud-upload",
        "copy",
        "duplicate",
        "print",
        "save",
        "scan",
        "search",
        "create",
        "pencil",
        "newspaper",
        "journal",
        "reader",
        "book",
        "library",
        "bookmark",
        "bookmarks",
        "text",
        "language",
        "easel",
        "school",
        "color-palette",
        "brush",
        "color-wand",
        "color-fill",
        "eyedrop",
        "crop",
        "aperture",
        "image",
        "images",
        "film",
        "disc",
        "music",
        "sparkles",
        "prism",
        "shapes",
        "cube",
        "gem",
        "balloon",
        "star",
        "heart",
        "code",
        "terminal",
        "git-branch",
        "browsers",
        "desktop",
        "laptop",
        "tv",
        "keypad",
        "hardware-chip",
        "server",
        "cloud",
        "cloud-done",
        "apps",
        "key",
        "lock-closed",
        "lock-open",
        "shield",
        "shield-checkmark",
        "ban",
        "warning",
        "information-circle",
        "help-buoy",
        "checkmark-circle",
        "gear",
        "wrench",
        "hammer",
        "construct",
        "cloud-download",
        "flashlight",
        "power",
        "bug",
        "flask",
        "beaker",
        "bulb",
        "telescope",
        "binoculars",
        "rocket",
        "medical",
        "medkit",
        "bandage",
        "fitness",
        "barbell",
        "thermometer",
        "bed",
        "nutrition",
        "egg",
        "water",
        "cutlery",
        "fast-food",
        "pizza",
        "ice-cream",
        "coffee",
        "beer",
        "wine",
        "fish",
        "leaf",
        "flower",
        "rose",
        "flame",
        "bolt",
        "bonfire",
        "sunny",
        "moon",
        "partly-sunny",
        "rainy",
        "thunderstorm",
        "snow",
        "umbrella",
        "paw",
        "earth",
        "globe",
        "planet",
        "home",
        "plane",
        "car",
        "car-sport",
        "bus",
        "train",
        "subway",
        "boat",
        "bicycle",
        "golf",
        "tennisball",
        "baseball",
        "basketball",
        "football",
        "american-football",
        "bowling-ball",
        "dice",
        "gamepad",
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

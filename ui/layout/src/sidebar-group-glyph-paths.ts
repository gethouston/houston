/**
 * The group mark set's PATH DATA: one `d` per mark, on Ionicons' native 512
 * box, in the order the picker's grid lays them out.
 *
 * The table is SPLIT into themed run modules (people+communication, commerce+
 * planning, office+creative, tech+health, world+leisure) because 251
 * silhouettes of data would bury this file; this module composes them in
 * display order and keeps the rules of the set in ONE place. The rules that
 * govern what a mark IS (why solid, why a second icon vocabulary, what a key
 * means once a group has stored it) live beside the component that renders
 * them: `sidebar-group-glyphs.tsx`.
 *
 * A key is the ionicons name with `-sharp` dropped (a handful of keys predate
 * this set and are stored under groups already — those keep their legacy
 * names). The shapes are Ionicons' OWN, copied verbatim: a mark's `<path>`
 * data is untouched (a terminal `Z` is appended where the source omits it — a
 * no-op for a filled path), invisible `fill="none"` helper elements are
 * dropped (they render nothing), and the primitives ionicons draws with
 * (`<polygon>`, `<rect>`, `<circle>`, `<ellipse>`) are expanded to their
 * exact path equivalent by a mechanical rule, coordinates and all. No
 * coordinate here was rescaled, rounded or redrawn by hand, so every mark can
 * still be diffed against upstream and a future update is a copy, not a
 * redraw.
 *
 * ---
 * Ionicons <https://ionic.io/ionicons> — MIT License.
 * Copyright (c) 2015-present Ionic <https://ionic.io/>.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction. The Software is provided "as is",
 * without warranty of any kind. The full licence text ships with the
 * `ionic-team/ionicons` repository.
 * ---
 */

import { GLYPHS_COMMERCE_PLANNING } from "./sidebar-group-glyph-paths-commerce-planning";
import { GLYPHS_OFFICE_CREATIVE } from "./sidebar-group-glyph-paths-office-creative";
import { GLYPHS_PEOPLE_COMMUNICATION } from "./sidebar-group-glyph-paths-people-communication";
import { GLYPHS_TECH_HEALTH } from "./sidebar-group-glyph-paths-tech-health";
import { GLYPHS_WORLD_LEISURE } from "./sidebar-group-glyph-paths-world-leisure";

export const SIDEBAR_GROUP_GLYPHS = {
  ...GLYPHS_PEOPLE_COMMUNICATION,
  ...GLYPHS_COMMERCE_PLANNING,
  ...GLYPHS_OFFICE_CREATIVE,
  ...GLYPHS_TECH_HEALTH,
  ...GLYPHS_WORLD_LEISURE,
};

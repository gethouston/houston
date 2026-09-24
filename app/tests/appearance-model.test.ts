import assert from "node:assert/strict";
import { test } from "node:test";
import { palettes } from "@houston/design-tokens";
import {
  arrowStep,
  chosenPalette,
  isRowDimmed,
  palettesForMode,
  wrapIndex,
} from "../src/components/settings/sections/appearance-model.ts";
import {
  DEFAULT_PALETTE,
  type ThemePreference,
} from "../src/lib/theme-model.ts";

/** A preference with a non-default palette on each side, so a mix-up shows. */
const PREF: ThemePreference = {
  mode: "system",
  light: "catppuccin-latte",
  dark: "nord",
};

test("each row offers exactly its own mode's palettes, and nothing else", () => {
  for (const mode of ["light", "dark"] as const) {
    const row = palettesForMode(mode);
    assert.ok(row.length > 1, `${mode} has more than Houston's own`);
    assert.deepEqual(
      row.map((palette) => palette.mode),
      row.map(() => mode),
    );
    assert.equal(
      row.length,
      palettes.filter((palette) => palette.mode === mode).length,
    );
  }
});

test("the two rows together are the whole library, with no palette twice", () => {
  const ids = [...palettesForMode("light"), ...palettesForMode("dark")].map(
    (palette) => palette.id,
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, palettes.length);
});

test("Houston's own palette leads each row", () => {
  assert.equal(palettesForMode("light")[0]?.id, DEFAULT_PALETTE.light);
  assert.equal(palettesForMode("dark")[0]?.id, DEFAULT_PALETTE.dark);
});

test("a row shows the palette saved for its own mode", () => {
  assert.equal(chosenPalette(PREF, "light"), "catppuccin-latte");
  assert.equal(chosenPalette(PREF, "dark"), "nord");
});

test("the dimmed row is the one whose mode is not on screen", () => {
  assert.equal(isRowDimmed("light", "dark"), true);
  assert.equal(isRowDimmed("light", "light"), false);
  assert.equal(isRowDimmed("dark", "light"), true);
  assert.equal(isRowDimmed("dark", "dark"), false);
});

test("only the four arrow keys move inside a row", () => {
  assert.equal(arrowStep("ArrowRight"), 1);
  assert.equal(arrowStep("ArrowDown"), 1);
  assert.equal(arrowStep("ArrowLeft"), -1);
  assert.equal(arrowStep("ArrowUp"), -1);
  for (const key of ["Enter", " ", "Tab", "a", "Home"]) {
    assert.equal(arrowStep(key), null, key);
  }
});

test("a row is a ring: the ends meet, and an absent selection lands on the first", () => {
  assert.equal(wrapIndex(0, 1, 6), 1);
  assert.equal(wrapIndex(5, 1, 6), 0);
  assert.equal(wrapIndex(0, -1, 6), 5);
  assert.equal(wrapIndex(-1, 1, 6), 0);
  assert.equal(wrapIndex(-1, -1, 6), 0);
});

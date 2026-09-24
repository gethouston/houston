import assert from "node:assert/strict";
import { test } from "node:test";
import { palettes } from "@houston/design-tokens";
import { DEFAULT_PALETTE, type ThemePreference } from "@houston/sdk/appearance";
import {
  arrowStep,
  chosenPalette,
  MODE_LABEL_KEY,
  MODE_ORDER,
  needsModeHint,
  paletteName,
  palettesForMode,
  summaryParts,
  wrapIndex,
} from "../src/components/settings/sections/appearance-model.ts";

/** A preference with a non-default palette on each side, so a mix-up shows. */
const PREF: ThemePreference = {
  mode: "system",
  light: "catppuccin-latte",
  dark: "nord",
};

test("each section offers exactly its own mode's palettes, and nothing else", () => {
  for (const mode of ["light", "dark"] as const) {
    const section = palettesForMode(mode);
    assert.ok(section.length > 1, `${mode} has more than Houston's own`);
    assert.deepEqual(
      section.map((palette) => palette.mode),
      section.map(() => mode),
    );
    assert.equal(
      section.length,
      palettes.filter((palette) => palette.mode === mode).length,
    );
  }
});

test("the two sections together are the whole library, with no palette twice", () => {
  const ids = [...palettesForMode("light"), ...palettesForMode("dark")].map(
    (palette) => palette.id,
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, palettes.length);
});

test("Houston's own palette leads each section", () => {
  assert.equal(palettesForMode("light")[0]?.id, DEFAULT_PALETTE.light);
  assert.equal(palettesForMode("dark")[0]?.id, DEFAULT_PALETTE.dark);
});

test("a section shows the palette saved for its own mode", () => {
  assert.equal(chosenPalette(PREF, "light"), "catppuccin-latte");
  assert.equal(chosenPalette(PREF, "dark"), "nord");
});

test("a palette is named by its own proper noun, never by its id", () => {
  assert.equal(paletteName("nord"), "Nord");
  assert.equal(paletteName(DEFAULT_PALETTE.light), "Houston Light");
});

test("the mode control lists every mode once, following the OS first", () => {
  assert.deepEqual([...MODE_ORDER], ["system", "light", "dark"]);
  assert.deepEqual(
    [...MODE_ORDER].sort(),
    Object.keys(MODE_LABEL_KEY).sort(),
    "every mode has a label key and every key has a mode",
  );
});

test("the summary names the mode by key and both palettes by name", () => {
  assert.deepEqual(summaryParts(PREF), {
    modeKey: "appearance.system",
    light: "Catppuccin Latte",
    dark: "Nord",
  });
  // An explicit mode still summarizes BOTH palettes: the dialog behind the row
  // edits both, so the row states the whole saved choice.
  assert.deepEqual(summaryParts({ ...PREF, mode: "dark" }), {
    modeKey: "appearance.dark",
    light: "Catppuccin Latte",
    dark: "Nord",
  });
});

test("the hinted section is the one whose mode is not on screen", () => {
  assert.equal(needsModeHint("light", "dark"), true);
  assert.equal(needsModeHint("light", "light"), false);
  assert.equal(needsModeHint("dark", "light"), true);
  assert.equal(needsModeHint("dark", "dark"), false);
});

test("only the four arrow keys move inside a section", () => {
  assert.equal(arrowStep("ArrowRight"), 1);
  assert.equal(arrowStep("ArrowDown"), 1);
  assert.equal(arrowStep("ArrowLeft"), -1);
  assert.equal(arrowStep("ArrowUp"), -1);
  for (const key of ["Enter", " ", "Tab", "a", "Home"]) {
    assert.equal(arrowStep(key), null, key);
  }
});

test("a section is a ring: the ends meet, and an absent selection lands on the first", () => {
  assert.equal(wrapIndex(0, 1, 6), 1);
  assert.equal(wrapIndex(5, 1, 6), 0);
  assert.equal(wrapIndex(0, -1, 6), 5);
  assert.equal(wrapIndex(-1, 1, 6), 0);
  assert.equal(wrapIndex(-1, -1, 6), 0);
});

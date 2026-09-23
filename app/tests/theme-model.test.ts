import assert from "node:assert/strict";
import { test } from "node:test";
import { palettes } from "@houston/design-tokens";
import {
  DEFAULT_PALETTE,
  DEFAULT_THEME_PREFERENCE,
  followsSystem,
  paletteSwatch,
  parsePaletteId,
  parseThemeMirror,
  parseThemeMode,
  resolveTheme,
  serializeThemeMirror,
  type ThemePreference,
} from "../src/lib/theme-model.ts";

/** A preference with a non-default palette on each side, to prove which is read. */
const PREF: ThemePreference = {
  mode: "light",
  light: "catppuccin-latte",
  dark: "nord",
};

const pref = (patch: Partial<ThemePreference>): ThemePreference => ({
  ...PREF,
  ...patch,
});

test("the shipped palettes cover both modes and carry Houston's own", () => {
  assert.ok(palettes.some((p) => p.id === DEFAULT_PALETTE.light));
  assert.ok(palettes.some((p) => p.id === DEFAULT_PALETTE.dark));
  assert.equal(
    palettes.find((p) => p.id === DEFAULT_PALETTE.dark)?.mode,
    "dark",
  );
});

test("an explicit mode resolves to itself and its side's palette", () => {
  assert.deepEqual(resolveTheme(pref({ mode: "light" }), false), {
    mode: "light",
    palette: "catppuccin-latte",
  });
  assert.deepEqual(resolveTheme(pref({ mode: "dark" }), true), {
    mode: "dark",
    palette: "nord",
  });
});

test("an explicit mode is invariant under the OS appearance", () => {
  for (const mode of ["light", "dark"] as const) {
    assert.deepEqual(
      resolveTheme(pref({ mode }), true),
      resolveTheme(pref({ mode }), false),
    );
  }
});

test("system follows the OS appearance, palette included", () => {
  assert.deepEqual(resolveTheme(pref({ mode: "system" }), true), {
    mode: "dark",
    palette: "nord",
  });
  assert.deepEqual(resolveTheme(pref({ mode: "system" }), false), {
    mode: "light",
    palette: "catppuccin-latte",
  });
});

test("only a system preference reacts to an OS change", () => {
  assert.equal(followsSystem(pref({ mode: "system" })), true);
  assert.equal(followsSystem(pref({ mode: "light" })), false);
  assert.equal(followsSystem(pref({ mode: "dark" })), false);
});

test("a palette saved under the wrong mode resolves to that mode's default", () => {
  // `nord` is dark; under `theme.light` it would paint dark colours in light.
  assert.deepEqual(
    resolveTheme({ mode: "light", light: "nord", dark: "nord" }, false),
    {
      mode: "light",
      palette: DEFAULT_PALETTE.light,
    },
  );
});

test("mode parsing accepts exactly the three shipped modes", () => {
  assert.equal(parseThemeMode("light"), "light");
  assert.equal(parseThemeMode("dark"), "dark");
  assert.equal(parseThemeMode("system"), "system");
  assert.equal(parseThemeMode("solarized"), null);
  assert.equal(parseThemeMode(null), null);
});

test("palette parsing rejects unknown ids and mode mismatches", () => {
  assert.equal(parsePaletteId("flexoki-light", "light"), "flexoki-light");
  assert.equal(parsePaletteId("gruvbox", "dark"), "gruvbox");
  assert.equal(parsePaletteId("gruvbox", "light"), null);
  assert.equal(parsePaletteId("flexoki-light", "dark"), null);
  assert.equal(parsePaletteId("nebula", "dark"), null);
  assert.equal(parsePaletteId(null, "light"), null);
});

test("the default preference is light with Houston's palettes", () => {
  assert.deepEqual(DEFAULT_THEME_PREFERENCE, {
    mode: "light",
    light: DEFAULT_PALETTE.light,
    dark: DEFAULT_PALETTE.dark,
  });
});

test("the mirror round-trips the resolved theme and its first-frame hexes", () => {
  const resolved = { mode: "dark", palette: "nord" } as const;
  const raw = serializeThemeMirror(resolved);
  const swatch = paletteSwatch("nord");
  assert.deepEqual(JSON.parse(raw), {
    mode: "dark",
    palette: "nord",
    base: swatch.base,
    screen: swatch.background,
  });
  assert.deepEqual(parseThemeMirror(raw), resolved);
});

test("the legacy bare-mode mirror reads as Houston's palette", () => {
  assert.deepEqual(parseThemeMirror("dark"), {
    mode: "dark",
    palette: DEFAULT_PALETTE.dark,
  });
  assert.deepEqual(parseThemeMirror("light"), {
    mode: "light",
    palette: DEFAULT_PALETTE.light,
  });
});

test("an unusable mirror reads as no mirror", () => {
  assert.equal(parseThemeMirror(null), null);
  assert.equal(parseThemeMirror("{not json"), null);
  assert.equal(parseThemeMirror("42"), null);
  assert.equal(parseThemeMirror('{"palette":"nord"}'), null);
  assert.equal(parseThemeMirror('{"mode":"sepia","palette":"nord"}'), null);
});

test("a mirror naming an unknown palette keeps its mode on the default", () => {
  assert.deepEqual(parseThemeMirror('{"mode":"dark","palette":"nebula"}'), {
    mode: "dark",
    palette: DEFAULT_PALETTE.dark,
  });
  // A light palette under a dark mode is the same unusable pairing.
  assert.deepEqual(
    parseThemeMirror('{"mode":"dark","palette":"flexoki-light"}'),
    { mode: "dark", palette: DEFAULT_PALETTE.dark },
  );
});

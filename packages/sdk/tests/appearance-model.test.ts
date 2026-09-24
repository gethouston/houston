import {
  DEFAULT_PALETTE,
  DEFAULT_THEME_PREFERENCE,
  followsSystem,
  listPalettes,
  paletteSwatch,
  parsePaletteId,
  parseThemeMode,
  resolveTheme,
  sameTheme,
  type ThemePreference,
} from "@houston/sdk/appearance";
import { describe, expect, it } from "vitest";

/**
 * The appearance vocabulary's own rules: which values this build ships, which
 * palette a mode wears, and what the OS appearance is allowed to move.
 *
 * Pure — no store, no kernel — because every surface resolves a theme through
 * exactly these functions, including a pre-paint script that runs before any SDK
 * exists.
 */

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

describe("the palette library", () => {
  it("covers both modes and carries Houston's own", () => {
    const palettes = listPalettes();
    expect(palettes.some((p) => p.id === DEFAULT_PALETTE.light)).toBe(true);
    expect(palettes.find((p) => p.id === DEFAULT_PALETTE.dark)?.mode).toBe(
      "dark",
    );
  });

  it("answers a palette's swatch, the source of every hex outside CSS", () => {
    const swatch = paletteSwatch("nord");
    expect(swatch.base).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatch.background).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("resolving a preference", () => {
  it("resolves an explicit mode to itself and to its side's palette", () => {
    expect(resolveTheme(pref({ mode: "light" }), false)).toEqual({
      mode: "light",
      palette: "catppuccin-latte",
    });
    expect(resolveTheme(pref({ mode: "dark" }), true)).toEqual({
      mode: "dark",
      palette: "nord",
    });
  });

  it("leaves an explicit mode invariant under the OS appearance", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(resolveTheme(pref({ mode }), true)).toEqual(
        resolveTheme(pref({ mode }), false),
      );
    }
  });

  it("follows the OS under system, palette included", () => {
    expect(resolveTheme(pref({ mode: "system" }), true)).toEqual({
      mode: "dark",
      palette: "nord",
    });
    expect(resolveTheme(pref({ mode: "system" }), false)).toEqual({
      mode: "light",
      palette: "catppuccin-latte",
    });
  });

  it("moves with an OS change only while the preference is system", () => {
    expect(followsSystem(pref({ mode: "system" }))).toBe(true);
    expect(followsSystem(pref({ mode: "light" }))).toBe(false);
    expect(followsSystem(pref({ mode: "dark" }))).toBe(false);
  });

  it("falls back to a mode's default when the saved palette is the other mode's", () => {
    // `nord` is dark; under `theme.light` it would paint dark colours in light.
    expect(
      resolveTheme({ mode: "light", light: "nord", dark: "nord" }, false),
    ).toEqual({ mode: "light", palette: DEFAULT_PALETTE.light });
  });
});

describe("parsing a stored value", () => {
  it("accepts exactly the three shipped modes", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("solarized")).toBeNull();
    expect(parseThemeMode(null)).toBeNull();
  });

  it("rejects unknown palette ids and mode mismatches", () => {
    expect(parsePaletteId("flexoki-light", "light")).toBe("flexoki-light");
    expect(parsePaletteId("gruvbox", "dark")).toBe("gruvbox");
    expect(parsePaletteId("gruvbox", "light")).toBeNull();
    expect(parsePaletteId("flexoki-light", "dark")).toBeNull();
    expect(parsePaletteId("nebula", "dark")).toBeNull();
    expect(parsePaletteId(null, "light")).toBeNull();
  });
});

describe("the default preference", () => {
  it("is light, with Houston's palette for each mode", () => {
    expect(DEFAULT_THEME_PREFERENCE).toEqual({
      mode: "light",
      light: DEFAULT_PALETTE.light,
      dark: DEFAULT_PALETTE.dark,
    });
  });
});

describe("comparing two preferences", () => {
  it("compares the choice, not the object", () => {
    expect(sameTheme(PREF, { ...PREF })).toBe(true);
    expect(sameTheme(PREF, pref({ dark: "gruvbox" }))).toBe(false);
    expect(sameTheme(PREF, pref({ mode: "system" }))).toBe(false);
  });
});

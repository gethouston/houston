/**
 * The theme model: modes, palettes, resolution, and the boot mirror's wire form.
 *
 * Pure data: design tokens in, plain values out, no DOM and no engine, so the
 * pre-paint path (`./theme-boot`) and the preference path (`./theme`) resolve a
 * theme through the same code, and every rule here is unit-testable without a
 * document.
 *
 * A preference is three independent choices: the MODE the app runs in (`light`,
 * `dark`, or `system`, which follows the OS appearance live) plus one palette
 * per mode, so switching mode keeps the palette chosen for the other one.
 * Resolution collapses them into the pair the DOM wears: a resolved mode and
 * exactly one palette.
 */

import { type PaletteId, palettes } from "@houston/design-tokens";

export type { PaletteId };

/** What the user chose. `system` means "follow the OS appearance". */
export type ThemeMode = "light" | "dark" | "system";

/** A mode the DOM can wear: `system` has already been resolved away. */
export type ResolvedMode = Exclude<ThemeMode, "system">;

/** The saved choice, one field per preference key (`theme`, `theme.{light,dark}`). */
export interface ThemePreference {
  mode: ThemeMode;
  light: PaletteId;
  dark: PaletteId;
}

/** The choice collapsed against the live OS appearance: what gets painted. */
export interface ResolvedTheme {
  mode: ResolvedMode;
  palette: PaletteId;
}

type Palette = (typeof palettes)[number];

/** A palette's four representative colours (see `@houston/design-tokens`). */
export type PaletteSwatch = Palette["swatch"];

/**
 * Every shipped palette by id. The token export is exhaustive over `PaletteId`,
 * so this lookup is total; the cast records that fact and widens nothing.
 */
const PALETTE_BY_ID = Object.fromEntries(
  palettes.map((palette) => [palette.id, palette]),
) as Record<PaletteId, Palette>;

/** The palette a mode falls back to: Houston's own, shipped since day one. */
export const DEFAULT_PALETTE: Readonly<Record<ResolvedMode, PaletteId>> = {
  light: "houston-light",
  dark: "houston-dark",
};

/**
 * What a device with nothing saved runs. The mode stays `light` rather than
 * `system` so an install that never picked a theme keeps the appearance it has
 * always had. `system` is a choice the user makes, not one made for them.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  mode: "light",
  light: DEFAULT_PALETTE.light,
  dark: DEFAULT_PALETTE.dark,
};

/** The palette's swatch, the source of every hex the theme paints outside CSS. */
export function paletteSwatch(id: PaletteId): PaletteSwatch {
  return PALETTE_BY_ID[id].swatch;
}

/** A stored `theme` value, or null when it is absent or not a mode we ship. */
export function parseThemeMode(value: string | null): ThemeMode | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

/**
 * A stored `theme.light` / `theme.dark` value, or null when it is absent,
 * unknown, or a palette of the OTHER mode: a dark palette saved under
 * `theme.light` would paint dark colours in light mode, so it is unusable and
 * the key falls back to its default.
 */
export function parsePaletteId(
  value: string | null,
  mode: ResolvedMode,
): PaletteId | null {
  if (value === null || !(value in PALETTE_BY_ID)) return null;
  const id = value as PaletteId;
  return PALETTE_BY_ID[id].mode === mode ? id : null;
}

/**
 * Collapse a preference against the OS appearance. Pure: the caller passes the
 * live `prefers-color-scheme` answer, which is why a preference that is not
 * `system` resolves identically whatever the OS is doing.
 */
export function resolveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  const mode: ResolvedMode =
    pref.mode === "system" ? (systemPrefersDark ? "dark" : "light") : pref.mode;
  const chosen = mode === "dark" ? pref.dark : pref.light;
  const palette =
    chosen in PALETTE_BY_ID && PALETTE_BY_ID[chosen].mode === mode
      ? chosen
      : DEFAULT_PALETTE[mode];
  return { mode, palette };
}

/**
 * A system appearance change only moves the app while the user asked to follow
 * the OS; an explicit light or dark choice is immune to it.
 */
export function followsSystem(pref: ThemePreference): boolean {
  return pref.mode === "system";
}

/**
 * The boot mirror: the resolved theme plus the two hexes the first frame needs
 * before any token CSS exists: `base` (the window gutter `<html>` paints) and
 * `screen` (the surface the browser/OS chrome matches in light).
 */
export interface ThemeMirror extends ResolvedTheme {
  base: string;
  screen: string;
}

/** The mirror as stored: JSON, so a palette travels with its first-frame hexes. */
export function serializeThemeMirror(resolved: ResolvedTheme): string {
  const swatch = paletteSwatch(resolved.palette);
  const mirror: ThemeMirror = {
    mode: resolved.mode,
    palette: resolved.palette,
    base: swatch.base,
    screen: swatch.background,
  };
  return JSON.stringify(mirror);
}

/**
 * Read a stored mirror. Junk, absent and unreadable all answer null, the same
 * "no mirror" a first launch means, corrected by the engine preference moments
 * later.
 *
 * The pre-palette mirror stored the bare mode (`"dark"`). It reads as Houston's
 * palette for that mode and the next apply rewrites it as JSON; that bare form
 * is the only legacy shape, and nothing writes it any more.
 */
export function parseThemeMirror(raw: string | null): ResolvedTheme | null {
  if (raw === null) return null;
  if (raw === "dark" || raw === "light") {
    return { mode: raw, palette: DEFAULT_PALETTE[raw] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { mode, palette } = parsed as Partial<
    Record<"mode" | "palette", unknown>
  >;
  if (mode !== "light" && mode !== "dark") return null;
  const id = typeof palette === "string" ? parsePaletteId(palette, mode) : null;
  return { mode, palette: id ?? DEFAULT_PALETTE[mode] };
}

/**
 * The appearance vocabulary and its rules: the modes an install can run in, the
 * palette each mode wears, and how a saved choice collapses into the one theme a
 * surface paints.
 *
 * Pure data — design tokens in, plain values out, no DOM, no storage, no engine
 * — so the pre-paint path of a surface, the settings picker and the facade in
 * `./index` all resolve a theme through the same code, and every rule here is
 * unit-testable without a document. Published as `@houston/sdk/appearance` as
 * well as through the barrel: a surface's first frame needs these rules before
 * any kernel exists.
 *
 * A preference is three independent choices: the MODE the app runs in (`light`,
 * `dark`, or `system`, which follows the OS appearance live) plus one palette per
 * mode, so switching mode keeps the palette chosen for the other one. Resolution
 * collapses them into the pair the DOM wears: a resolved mode and one palette.
 */

import { palettes } from "@houston/design-tokens";

/**
 * One entry of the shipped palette library. Narrowed from the token export
 * rather than taken from its wide `Palette` type, so an id stays a literal and
 * {@link PaletteId} is the closed set the compiler checks picks against.
 */
export type Palette = (typeof palettes)[number];

/** Every palette this build ships, by id. */
export type PaletteId = Palette["id"];

/** A palette's four representative colours (see `@houston/design-tokens`). */
export type PaletteSwatch = Palette["swatch"];

/** What the user chose. `system` means "follow the OS appearance". */
export type ThemeMode = "light" | "dark" | "system";

/** A mode a surface can wear: `system` has already been resolved away. */
export type ResolvedMode = Exclude<ThemeMode, "system">;

/** The saved choice, one field per stored key (`theme`, `theme.{light,dark}`). */
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

/**
 * Every shipped palette by id. The token export is exhaustive over
 * {@link PaletteId}, so this lookup is total; the cast records that fact and
 * widens nothing.
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

/** The whole library, in picker order: what a surface or the assistant offers. */
export function listPalettes(): readonly Palette[] {
  return palettes;
}

/** The palette's swatch, the source of every hex a theme paints outside CSS. */
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
 * Whether two preferences are the same CHOICE. A surface holds two of these at
 * once — the one on screen and the one saved — and they are rebuilt object by
 * object, so "has anything moved" is a field comparison, never an identity one.
 */
export function sameTheme(a: ThemePreference, b: ThemePreference): boolean {
  return a.mode === b.mode && a.light === b.light && a.dark === b.dark;
}

/**
 * A system appearance change only moves the app while the user asked to follow
 * the OS; an explicit light or dark choice is immune to it.
 */
export function followsSystem(pref: ThemePreference): boolean {
  return pref.mode === "system";
}

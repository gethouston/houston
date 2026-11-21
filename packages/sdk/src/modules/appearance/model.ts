import { palettes } from "@houston/design-tokens";

export type Palette = (typeof palettes)[number];

export type PaletteId = Palette["id"];

export type PaletteSwatch = Palette["swatch"];

export type ThemeMode = "light" | "dark" | "system";

export type ResolvedMode = Exclude<ThemeMode, "system">;

export interface ThemePreference {
  mode: ThemeMode;
  light: PaletteId;
  dark: PaletteId;
}

export interface ResolvedTheme {
  mode: ResolvedMode;
  palette: PaletteId;
}

const PALETTE_BY_ID = Object.fromEntries(
  palettes.map((palette) => [palette.id, palette]),
) as Record<PaletteId, Palette>;

export const DEFAULT_PALETTE: Readonly<Record<ResolvedMode, PaletteId>> = {
  light: "houston-light",
  dark: "houston-dark",
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  mode: "light",
  light: DEFAULT_PALETTE.light,
  dark: DEFAULT_PALETTE.dark,
};

export function listPalettes(): readonly Palette[] {
  return palettes;
}

export function paletteSwatch(id: PaletteId): PaletteSwatch {
  return PALETTE_BY_ID[id].swatch;
}

export function parseThemeMode(value: string | null): ThemeMode | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

export function parsePaletteId(
  value: string | null,
  mode: ResolvedMode,
): PaletteId | null {
  if (value === null || !(value in PALETTE_BY_ID)) return null;
  const id = value as PaletteId;
  return PALETTE_BY_ID[id].mode === mode ? id : null;
}

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

export function sameTheme(a: ThemePreference, b: ThemePreference): boolean {
  return a.mode === b.mode && a.light === b.light && a.dark === b.dark;
}

export function followsSystem(pref: ThemePreference): boolean {
  return pref.mode === "system";
}

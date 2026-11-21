import {
  listPalettes,
  type Palette,
  type PaletteId,
  type ResolvedMode,
  type ThemeMode,
  type ThemePreference,
} from "@houston/sdk/appearance";

export type PaletteEntry = Palette;

const palettes = listPalettes();

const BY_MODE: Readonly<Record<ResolvedMode, readonly PaletteEntry[]>> = {
  light: palettes.filter((palette) => palette.mode === "light"),
  dark: palettes.filter((palette) => palette.mode === "dark"),
};

const NAME_BY_ID = Object.fromEntries(
  palettes.map((palette) => [palette.id, palette.name]),
) as Record<PaletteId, string>;

export const MODE_ORDER = ["system", "light", "dark"] as const;

export const MODE_LABEL_KEY = {
  system: "appearance.system",
  light: "appearance.light",
  dark: "appearance.dark",
} as const satisfies Record<ThemeMode, string>;

export function palettesForMode(mode: ResolvedMode): readonly PaletteEntry[] {
  return BY_MODE[mode];
}

export function chosenPalette(
  pref: ThemePreference,
  mode: ResolvedMode,
): PaletteId {
  return mode === "dark" ? pref.dark : pref.light;
}

export function paletteName(id: PaletteId): string {
  return NAME_BY_ID[id];
}

export interface SummaryParts {
  modeKey: (typeof MODE_LABEL_KEY)[ThemeMode];
  light: string;
  dark: string;
}

export function summaryParts(pref: ThemePreference): SummaryParts {
  return {
    modeKey: MODE_LABEL_KEY[pref.mode],
    light: paletteName(pref.light),
    dark: paletteName(pref.dark),
  };
}

export function needsModeHint(
  resolved: ResolvedMode,
  section: ResolvedMode,
): boolean {
  return section !== resolved;
}

export function arrowStep(key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}

export function wrapIndex(from: number, step: number, count: number): number {
  if (from < 0) return 0;
  return (from + step + count) % count;
}

/**
 * The Appearance section's pure rules: which palettes a mode offers, which one
 * a row shows as chosen, which row is dimmed, and where an arrow key lands.
 *
 * No React and no DOM, so the grouping and the keyboard maths are unit-testable
 * (`app/tests/appearance-model.test.ts`) without rendering the section.
 */

import { palettes } from "@houston/design-tokens";
import type {
  PaletteId,
  ResolvedMode,
  ThemePreference,
} from "../../../lib/theme-model";

/** One entry of the shipped library, with its id kept as a literal `PaletteId`. */
export type PaletteEntry = (typeof palettes)[number];

/**
 * The palettes of each mode, in the token export's own order — Houston's
 * authored set leads its mode, then the imports (DESIGN.md §2). Computed once:
 * the library is a frozen constant, so re-filtering per render would buy
 * nothing.
 */
const BY_MODE: Readonly<Record<ResolvedMode, readonly PaletteEntry[]>> = {
  light: palettes.filter((palette) => palette.mode === "light"),
  dark: palettes.filter((palette) => palette.mode === "dark"),
};

/** Every palette a mode can wear, in the order its row paints them. */
export function palettesForMode(mode: ResolvedMode): readonly PaletteEntry[] {
  return BY_MODE[mode];
}

/** The palette a mode's row shows as chosen: that mode's own saved field. */
export function chosenPalette(
  pref: ThemePreference,
  mode: ResolvedMode,
): PaletteId {
  return mode === "dark" ? pref.dark : pref.light;
}

/**
 * Whether a row holds the palettes NOT on screen right now. Dimmed, never
 * disabled: picking the palette for the other mode is a valid, silent choice
 * that shows the next time that mode is resolved.
 */
export function isRowDimmed(
  resolved: ResolvedMode,
  row: ResolvedMode,
): boolean {
  return row !== resolved;
}

/** How far an arrow key moves inside a swatch row; null for any other key. */
export function arrowStep(key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}

/**
 * The index `step` away, wrapping: a swatch row is a ring, so its ends meet.
 *
 * `from` below zero means the row holds no selection at all — only reachable if
 * a saved palette belonged to the other mode, which `parsePaletteId` already
 * refuses — and the first arrow press then lands on the first swatch.
 */
export function wrapIndex(from: number, step: number, count: number): number {
  if (from < 0) return 0;
  return (from + step + count) % count;
}

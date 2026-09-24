/**
 * The Appearance row's pure rules: which palettes a mode offers, which one a
 * section shows as chosen, which section needs its "shows when…" hint, the words
 * the row's summary interpolates, and where an arrow key lands.
 *
 * No React and no DOM, so the grouping, the summary inputs and the keyboard
 * maths are unit-testable (`app/tests/appearance-model.test.ts`) without
 * rendering the row or opening the dialog.
 */

import { palettes } from "@houston/design-tokens";
import type {
  PaletteId,
  ResolvedMode,
  ThemeMode,
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

/** Every palette name by id: what the row's summary and a tile's label read. */
const NAME_BY_ID = Object.fromEntries(
  palettes.map((palette) => [palette.id, palette.name]),
) as Record<PaletteId, string>;

/**
 * The modes the mode control offers, in the order it lists them: following the
 * OS leads, then the two explicit choices.
 */
export const MODE_ORDER = ["system", "light", "dark"] as const;

/**
 * The `settings` key naming each mode, so the control, the summary and the
 * dialog's hints all say the same word for the same mode. Literal values, which
 * is what keeps `t()` type-checked against the namespace.
 */
export const MODE_LABEL_KEY = {
  system: "appearance.system",
  light: "appearance.light",
  dark: "appearance.dark",
} as const satisfies Record<ThemeMode, string>;

/** Every palette a mode can wear, in the order its section paints them. */
export function palettesForMode(mode: ResolvedMode): readonly PaletteEntry[] {
  return BY_MODE[mode];
}

/** The palette a mode's section shows as chosen: that mode's own saved field. */
export function chosenPalette(
  pref: ThemePreference,
  mode: ResolvedMode,
): PaletteId {
  return mode === "dark" ? pref.dark : pref.light;
}

/** A palette's own proper noun ("Nord"), never translated — a palette is a name. */
export function paletteName(id: PaletteId): string {
  return NAME_BY_ID[id];
}

/** The three words the row's one-line summary interpolates. */
export interface SummaryParts {
  /** The mode's label key, resolved by the caller that holds `t()`. */
  modeKey: (typeof MODE_LABEL_KEY)[ThemeMode];
  light: string;
  dark: string;
}

/**
 * The current state in words: the mode, plus the palette each mode wears. Both
 * palettes show, whichever mode is on screen — the summary is the whole saved
 * choice, which is exactly what the dialog behind it edits.
 */
export function summaryParts(pref: ThemePreference): SummaryParts {
  return {
    modeKey: MODE_LABEL_KEY[pref.mode],
    light: paletteName(pref.light),
    dark: paletteName(pref.dark),
  };
}

/**
 * Whether a dialog section holds the palettes NOT on screen right now, which is
 * what its hint says out loud. The section stays fully interactive: picking the
 * palette for the other mode is a valid choice that shows the next time that
 * mode resolves, so it is explained rather than dimmed.
 */
export function needsModeHint(
  resolved: ResolvedMode,
  section: ResolvedMode,
): boolean {
  return section !== resolved;
}

/** How far an arrow key moves inside a palette section; null for any other key. */
export function arrowStep(key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}

/**
 * The index `step` away, wrapping: a palette section is a ring, so its ends meet.
 *
 * `from` below zero means the section holds no selection at all — only reachable
 * if a saved palette belonged to the other mode, which `parsePaletteId` already
 * refuses — and the first arrow press then lands on the first tile.
 */
export function wrapIndex(from: number, step: number, count: number): number {
  if (from < 0) return 0;
  return (from + step + count) % count;
}

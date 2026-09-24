/**
 * The boot mirror's wire form: the resolved theme as the FIRST frame reads it.
 *
 * The vocabulary and every rule over it — the modes, the palette library,
 * validation, resolution — live in `@houston/sdk/appearance`, so the engine path,
 * this mirror and the AI Manager all answer the same way. What is left here is
 * the mirror alone: device-local, JSON, and read by the pre-paint script in both
 * index.html files before any module graph exists.
 *
 * Pure data, no DOM and no engine, so the pre-paint path (`./theme-boot`) and the
 * preference path (`./theme`) share it and it stays unit-testable without a
 * document.
 */

import {
  DEFAULT_PALETTE,
  paletteSwatch,
  parsePaletteId,
  type ResolvedTheme,
} from "@houston/sdk/appearance";

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

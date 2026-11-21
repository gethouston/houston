import {
  DEFAULT_PALETTE,
  paletteSwatch,
  parsePaletteId,
  type ResolvedTheme,
} from "@houston/sdk/appearance";

export interface ThemeMirror extends ResolvedTheme {
  base: string;
  screen: string;
}

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

import { contrast, formatColor, withAlpha } from "./color.mjs";
import { BODY_FLOOR, inkStepper, surfaceStack } from "./palette-ladder.mjs";

const MUTED_FLOOR = 3;

function accentText(accent, p, notes) {
  const label = [
    p.background,
    p.bright_foreground,
    "#000000",
    "#ffffff",
  ].reduce((best, c) =>
    contrast(c, accent) > contrast(best, accent) ? c : best,
  );
  const ratio = contrast(label, accent);
  if (ratio < BODY_FLOOR) {
    throw new Error(
      `${p.id}: the accent's label reads ${ratio.toFixed(2)}:1 on the accent (${formatColor(accent)}), below ${BODY_FLOOR}:1`,
    );
  }
  if (label === "#000000" || label === "#ffffff") {
    notes.push(
      `${p.id}: the accent's label is ${label} (${ratio.toFixed(2)}:1 on accent ${formatColor(accent)}); no palette colour reads better`,
    );
  }
  return label;
}

/**
 * Every text and interactive role one palette derives from its own hues.
 *
 * @param {Record<string, string> & { id: string, mode: "light" | "dark" }} p
 * @param {Record<string, unknown>} surfaces the already-derived surface roles
 * @param {string[]} notes
 */
export function paletteText(p, surfaces, notes) {
  const dark = p.mode === "dark";
  const fg = p.foreground;
  const bg = p.background;
  const step = inkStepper(p, surfaceStack(surfaces).all, notes);
  const accentLabel = accentText(p.accent, p, notes);

  return {
    ink: fg,
    "ink-muted": step("ink-muted", p.muted, MUTED_FLOOR),
    "card-text": fg,
    "popover-text": fg,
    "chip-text": fg,
    "sidebar-text": fg,
    "sidebar-hover-text": fg,
    "hover-text": fg,
    "prose-text": dark ? p.bright_foreground : fg,
    action: p.accent,
    "action-text": accentLabel,
    focus: p.accent,
    bubble: dark ? withAlpha(fg, 0.045) : fg,
    "bubble-text": dark ? p.bright_foreground : bg,
    "bubble-chip": dark ? withAlpha(fg, 0.1) : withAlpha(bg, 0.2),
    "bubble-chip-text": dark ? fg : bg,
  };
}

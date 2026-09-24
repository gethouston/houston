import { contrast, formatColor, withAlpha } from "./color.mjs";
import { BODY_FLOOR, inkStepper, surfaceStack } from "./palette-ladder.mjs";

// The text half of the palette derivation: ink, the roles that simply ARE the
// palette's foreground or background, the user's own chat bubble, and the accent
// the palette wears as its action colour. `ink-muted` is the one role here the
// ladder steps. The status family and the link are inherited rather than derived
// (`palette-status.mjs`), because status is semantics, not surface.

const MUTED_FLOOR = 3;

/**
 * The label printed ON the accent: `action-text`, and the light primary button's
 * `cta-text`, which is the same accent fill (`palette-cta.mjs`). That accent is a
 * hue tuned for a terminal prompt rather than for a button, so the label is
 * measured rather than assumed: whichever of the palette's background, its
 * brightest ink, black and white reads best, and a build error when even the
 * best one misses the body floor, because an accent fill carries text a user
 * cannot avoid reading.
 */
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
  // Measured once, and returned as `action-text`: the light button wears the same
  // label, so the build prints one note rather than the same note twice.
  const accentLabel = accentText(p.accent, p, notes);

  return {
    ink: fg,
    // `ink-muted` is secondary text, held to the 3:1 non-body floor.
    "ink-muted": step("ink-muted", p.muted, MUTED_FLOOR),
    "card-text": fg,
    "popover-text": fg,
    "chip-text": fg,
    "sidebar-text": fg,
    "sidebar-hover-text": fg,
    "hover-text": fg,
    "prose-text": dark ? p.bright_foreground : fg,
    // An import is a colour identity, so the action colour and the focus ring
    // wear the palette's own accent, and so does the primary button
    // (`palette-cta.mjs`). Houston's authored sets keep an ink action by
    // doctrine, and they never reach this derivation: they ARE the base blocks.
    action: p.accent,
    "action-text": accentLabel,
    focus: p.accent,
    // The user's own bubble inverts in light (ink fill, background text) and is a
    // faint ink wash in dark; the chip inside it is the bubble's TEXT colour at
    // Houston's alpha, so it stays legible against the fill either way.
    bubble: dark ? withAlpha(fg, 0.045) : fg,
    "bubble-text": dark ? p.bright_foreground : bg,
    "bubble-chip": dark ? withAlpha(fg, 0.1) : withAlpha(bg, 0.2),
    "bubble-chip-text": dark ? fg : bg,
  };
}

import { composite, formatColor, mix, withAlpha } from "./color.mjs";
import { BODY_FLOOR, nudge } from "./palette-text.mjs";

// The filled primary button, the one surface a palette shouts from. Houston's
// two authored sets set the grammar per mode: a near-ink solid pill in light, a
// white frost pill with a hairline rim in dark. An imported palette keeps that
// structure and swaps the hue for its accent, so a primary button reads as the
// same button in either mode: a solid accent pill in light, because a
// translucent fill on a light surface reads as a disabled control, and the
// frost pill tinted with the accent in dark, where the glass IS the structure
// the whole set is built on and a solid accent slab shouts over it.

/**
 * The label on the dark frost pill. A translucent pill is partly its own hue and
 * partly whatever is under it, so the label is measured on the pill over BOTH
 * surfaces a primary button sits on: the field it sits in and the gutter behind
 * it. It starts at the palette's bright foreground, the brightest ink the
 * palette owns, and steps toward white until it clears the body floor on both.
 */
function frostLabel(p, fill, surfaces, notes) {
  const { value, steps } = nudge(
    p.bright_foreground,
    "#ffffff",
    [composite(fill, surfaces.input), composite(fill, surfaces.base)],
    BODY_FLOOR,
    `${p.id}: --ht-cta-text`,
  );
  if (steps > 0) {
    notes.push(
      `${p.id}: cta-text ${formatColor(p.bright_foreground)} -> ${formatColor(value)} (${steps * 2}% toward white, floor ${BODY_FLOOR}:1)`,
    );
  }
  return value;
}

/**
 * The `cta` pair for one palette: fill, label, hover fill and the two rims.
 *
 * The dark alphas sit denser than Houston dark's own 8 / 13 / 20 / 30 white
 * frost, because a hue carries less light than white does at the same alpha and
 * an 8% accent over a dark screen reads as nothing at all.
 *
 * @param {Record<string, string> & { id: string, mode: "light" | "dark" }} p
 * @param {Record<string, unknown>} surfaces the already-derived surface roles
 * @param {string} accentLabel the measured label on the accent, as `action-text`
 *   wears it; the light pill IS the accent, so it wears the same one
 * @param {string[]} notes
 */
export function paletteCta(p, surfaces, accentLabel, notes) {
  if (p.mode === "light") {
    return {
      cta: p.accent,
      "cta-text": accentLabel,
      "cta-hover": mix(p.accent, p.foreground, 0.12),
      "cta-rim": "transparent",
      "cta-rim-hover": "transparent",
    };
  }
  const fill = withAlpha(p.accent, 0.14);
  return {
    cta: fill,
    "cta-text": frostLabel(p, fill, surfaces, notes),
    "cta-hover": withAlpha(p.accent, 0.22),
    "cta-rim": withAlpha(p.accent, 0.35),
    "cta-rim-hover": withAlpha(p.accent, 0.5),
  };
}

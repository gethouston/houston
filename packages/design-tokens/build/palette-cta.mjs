import { composite, formatColor, mix, withAlpha } from "./color.mjs";
import { BODY_FLOOR, nudge } from "./palette-ladder.mjs";

function frostLabel(p, fill, surfaces, notes) {
  const { value, steps } = nudge(
    p.bright_foreground,
    "#ffffff",
    () => [composite(fill, surfaces.input), composite(fill, surfaces.base)],
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

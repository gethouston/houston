import { composite, luminance, mix, withAlpha } from "./color.mjs";

// The surface half of the palette derivation: the ladder (gutter, screen, field,
// card, popover, chip), the lines, and the alpha washes. Houston's STRUCTURE is
// what carries over — which tier sits above which, and by how much — while the
// hexes come from the imported palette. The constants below are read off the
// Houston sets, so an imported palette's ladder has the same rhythm as the
// authored one.

/**
 * The alpha each wash wears, per mode, read off Houston's own tokens. The colour
 * is always the palette's foreground: a wash is ink laid thinly on whatever is
 * underneath, so it re-tints itself for free when the surface changes.
 *
 * Houston's LIGHT hover, chip-solid and field-hover ship as opaque grays rather
 * than washes (`#efefef` is ink at ~6% on white); the light ladder below spends
 * the same 6% as an explicit mix so those tiers stay opaque, and the wash table
 * holds only the roles Houston itself authors with alpha.
 */
const WASH = {
  light: {
    hover: 0.06,
    chip: 0.035,
    "chip-subtle": 0.035,
    "tab-track": 0.06,
    "sidebar-line": 0.06,
    "sidebar-hover": 0.06,
    "sidebar-active": 0.1,
  },
  dark: {
    hover: 0.08,
    chip: 0.05,
    "chip-subtle": 0.045,
    "tab-track": 0.06,
    line: 0.1,
    "sidebar-line": 0.08,
    "sidebar-hover": 0.06,
    "sidebar-active": 0.1,
  },
};

/**
 * A light palette's chip tier. Omarchy's `lighter_background` means "one step
 * away from background" in a DARK theme's direction, so in a light palette it is
 * usually the DARKER neighbour — and `white` sets it to `#c0c0c0`, far too heavy
 * for a chip. When luminance says it is darker than the background, the chip
 * falls back to Houston's own recess (ink at 6%), which is exactly the step
 * `#ffffff` → `#efefef` the authored light set makes.
 */
function lightChip(p, notes) {
  if (luminance(p.lighter_background) >= luminance(p.background)) {
    return p.lighter_background;
  }
  notes.push(
    `${p.id}: chip-solid falls back to mix(background, foreground, 6%) — lighter_background (${p.lighter_background}) is darker than background (${p.background})`,
  );
  return mix(p.background, p.foreground, 0.06);
}

function lightLadder(p, notes) {
  const bg = p.background;
  const fg = p.foreground;
  const recess = mix(bg, fg, 0.015);
  return {
    base: mix(bg, fg, 0.04),
    background: bg,
    pane: bg,
    input: recess,
    field: recess,
    "field-hover": mix(bg, fg, 0.06),
    card: withAlpha(bg, 0.68),
    "card-hover": withAlpha(bg, 0.76),
    "card-solid": bg,
    "tab-active": bg,
    popover: bg,
    dialog: bg,
    "chip-solid": lightChip(p, notes),
    "chip-solid-hover": mix(bg, fg, 0.1),
    // Houston's light hairline is an accent tint, not a gray: the brand
    // border-wash `rgba(60, 70, 120, 0.1)` is the blue-ink edge the light
    // screen wears.
    line: withAlpha(p.accent, 0.1),
    "line-input": mix(bg, fg, 0.12),
    sidebar: "transparent",
  };
}

function darkLadder(p) {
  const bg = p.background;
  const fg = p.foreground;
  const lighter = p.lighter_background;
  const screen = withAlpha(bg, 0.55);
  // The screen-tone rule: a resting card IS the frosted screen's own composited
  // tone, so a board card reads as the screen showing through its column tray
  // rather than a slab laid on it.
  const cardSolid = composite(screen, p.darker_background);
  const lineInput = mix(bg, fg, 0.15);
  return {
    base: p.darker_background,
    background: screen,
    pane: "transparent",
    input: bg,
    field: withAlpha(lineInput, 0.3),
    "field-hover": withAlpha(lineInput, 0.5),
    card: withAlpha(lighter, 0.5),
    "card-hover": withAlpha(lighter, 0.58),
    "card-solid": cardSolid,
    "tab-active": cardSolid,
    popover: lighter,
    dialog: lighter,
    "chip-solid": lighter,
    "chip-solid-hover": mix(lighter, fg, 0.06),
    "line-input": lineInput,
    sidebar: "transparent",
  };
}

/**
 * Every surface, line and wash role for one palette.
 *
 * @param {Record<string, string> & { id: string, mode: "light" | "dark" }} p
 * @param {string[]} notes
 */
export function paletteSurfaces(p, notes) {
  const ladder = p.mode === "light" ? lightLadder(p, notes) : darkLadder(p);
  /** @type {Record<string, unknown>} */
  const out = { ...ladder };
  for (const [role, alpha] of Object.entries(WASH[p.mode])) {
    out[role] = withAlpha(p.foreground, alpha);
  }
  return out;
}

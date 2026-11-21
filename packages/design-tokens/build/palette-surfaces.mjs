import { composite, luminance, mix, withAlpha } from "./color.mjs";

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

import { composite, formatColor, hue } from "./color.mjs";
import { colors } from "./model.mjs";
import { loadPalette, PALETTE_ORDER } from "./omarchy.mjs";
import { paletteCta } from "./palette-cta.mjs";
import { paletteStatus } from "./palette-status.mjs";
import { paletteSurfaces } from "./palette-surfaces.mjs";
import { paletteText } from "./palette-text.mjs";

const AUTHORED = [
  "glow-",
  "agent-",
  "org-",
  "employee-metal-",
  "filetype-",
  "person-",
  "flash",
  "qr-",
];

const isAuthored = (name) =>
  AUTHORED.some((family) => name === family || name.startsWith(family));

const houstonChromatic = (byName) =>
  hue(byName.action) === null ? byName.link : byName.action;

function swatch(byName, accent = houstonChromatic(byName)) {
  const base = byName.base;
  const screen = composite(byName.background, base);
  return {
    base: formatColor(base),
    background: formatColor(screen),
    ink: formatColor(composite(byName.ink, screen)),
    accent: formatColor(composite(accent, screen)),
  };
}

const indexByName = (entries) =>
  Object.fromEntries(entries.map(({ name, value }) => [name, value]));

/**
 * Derive one imported palette into the complete Houston role set.
 *
 * @param {{ name: string, value: string }[]} base the Houston set of the same mode
 * @param {Record<string, string> & { id: string, name: string, mode: "light" | "dark" }} p
 */
export function derivePalette(base, p) {
  /** @type {string[]} */
  const notes = [];
  const surfaces = paletteSurfaces(p, notes);
  const text = paletteText(p, surfaces, notes);
  const status = paletteStatus(indexByName(base), p, surfaces, notes);
  const cta = paletteCta(p, surfaces, text["action-text"], notes);
  const derived = { ...surfaces, ...text, ...status, ...cta };
  for (const role of Object.keys(derived)) {
    if (!base.some((entry) => entry.name === role)) {
      throw new Error(
        `palette ${p.id}: derives --ht-${role}, which the Houston set does not define`,
      );
    }
  }
  const entries = base.map(({ name, value }) => {
    if (isAuthored(name)) return { name, value };
    if (derived[name] === undefined) {
      throw new Error(`palette ${p.id}: no derivation for --ht-${name}`);
    }
    return { name, value: formatColor(derived[name]) };
  });
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    emitsBlock: true,
    colors: entries,
    swatch: swatch(indexByName(entries), p.accent),
    notes,
  };
}

/**
 * The whole palette library, in picker order. Houston's two sets carry no CSS
 * block of their own; every import carries a full `[data-palette]` set.
 *
 * @param {{ path: string[], value: string }[]} light
 * @param {{ path: string[], value: string }[]} dark
 */
export function buildPalettes(light, dark) {
  const base = { light: colors(light), dark: colors(dark) };
  return PALETTE_ORDER.map((entry) => {
    if (entry.houston) {
      const entries = base[entry.mode];
      return {
        id: entry.id,
        name: entry.name,
        mode: entry.mode,
        emitsBlock: false,
        colors: entries,
        swatch: swatch(indexByName(entries)),
        notes: [],
      };
    }
    const palette = loadPalette(entry);
    return derivePalette(base[palette.mode], palette);
  });
}

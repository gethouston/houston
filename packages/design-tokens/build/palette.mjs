import { composite, formatColor, hue } from "./color.mjs";
import { colors } from "./model.mjs";
import { loadPalette, PALETTE_ORDER } from "./omarchy.mjs";
import { paletteCta } from "./palette-cta.mjs";
import { paletteStatus } from "./palette-status.mjs";
import { paletteSurfaces } from "./palette-surfaces.mjs";
import { paletteText } from "./palette-text.mjs";

// Mode and palette are two axes. `mode` (light | dark) decides which authored
// Houston set a palette is derived FROM and which structure it wears; the palette
// decides the hexes. Houston Light and Houston Dark are the authored sets
// themselves, so they are derived from nothing and emit no CSS block: they ARE
// the :root / [data-theme] blocks, which is how the zero-diff proof stays intact.

/**
 * The families Houston AUTHORS rather than derives; an imported palette inherits
 * them from the Houston set of its own mode, unchanged. They are identity (agent
 * helmets, file-type glyphs, human avatars), the brand comet, and one effect
 * wash: none of them is a surface a terminal palette gets a say in, and each is
 * already contrast-tuned against the ladder every palette keeps. The status
 * family and the link are inherited for the same reason, but they are re-measured
 * on the palette's surfaces, so `palette-status.mjs` owns them.
 */
const AUTHORED = ["glow-", "agent-", "filetype-", "person-", "flash"];

const isAuthored = (name) =>
  AUTHORED.some((family) => name === family || name.startsWith(family));

/**
 * The hue a set spends colour on: its action colour when that carries a hue at
 * all, which for an import IS its accent, worn by the button, the action colour
 * and the focus ring. Houston's own action is ink by doctrine, so its sets fall
 * through to the link, the one place they spend colour on content.
 */
const chromatic = (byName) =>
  hue(byName.action) === null ? byName.link : byName.action;

/** The four hexes the picker paints a palette's swatch with. */
function swatch(byName) {
  const base = byName.base;
  const screen = composite(byName.background, base);
  return {
    base: formatColor(base),
    background: formatColor(screen),
    ink: formatColor(composite(byName.ink, screen)),
    accent: formatColor(composite(chromatic(byName), screen)),
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
  // The light primary button IS the accent fill, the same one `action-text` was
  // measured on, so the button reuses that measurement rather than repeating it.
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
    swatch: swatch(indexByName(entries)),
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

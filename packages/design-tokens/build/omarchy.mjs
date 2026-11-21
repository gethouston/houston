import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatColor, mix, parseColor } from "./color.mjs";

const VENDOR = fileURLToPath(new URL("../vendor/omarchy", import.meta.url));

export const PALETTE_ORDER = [
  { id: "houston-light", name: "Houston Light", mode: "light", houston: true },
  { id: "houston-dark", name: "Houston Dark", mode: "dark", houston: true },
  { id: "catppuccin-latte", name: "Catppuccin Latte", mode: "light" },
  { id: "flexoki-light", name: "Flexoki Light", mode: "light" },
  { id: "rose-pine", name: "Rosé Pine Dawn", mode: "light" },
  { id: "lupine", name: "Lupine", mode: "light" },
  { id: "white", name: "White", mode: "light" },
  { id: "tokyo-night", name: "Tokyo Night", mode: "dark" },
  { id: "catppuccin", name: "Catppuccin Mocha", mode: "dark" },
  { id: "nord", name: "Nord", mode: "dark" },
  { id: "gruvbox", name: "Gruvbox", mode: "dark" },
  { id: "everforest", name: "Everforest", mode: "dark" },
];

const REQUIRED = [
  "accent",
  "selection",
  "muted",
  "background",
  "dark_background",
  "darker_background",
  "lighter_background",
  "foreground",
  "dark_foreground",
  "light_foreground",
  "bright_foreground",
  "red",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
  "bright_red",
  "bright_yellow",
  "bright_green",
  "bright_cyan",
  "bright_blue",
  "bright_magenta",
];

const OPTIONAL = ["orange", "brown"];

const LINE = /^([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"$/;

/**
 * Read the flat `key = "value"` subset of TOML the Omarchy palettes are written
 * in. Quoted strings only; blank lines and `#` comments are skipped; anything
 * else throws with its line number.
 *
 * @param {string} text
 * @param {string} source
 * @returns {Record<string, string>}
 */
export function parseToml(text, source) {
  /** @type {Record<string, string>} */
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = LINE.exec(line);
    if (!match) {
      throw new Error(
        `${source}:${i + 1}: not a 'key = "value"' line: ${line}`,
      );
    }
    if (match[1] in out) {
      throw new Error(`${source}:${i + 1}: duplicate key "${match[1]}"`);
    }
    out[match[1]] = match[2];
  }
  return out;
}

/**
 * Load one vendored palette: every required hue, Omarchy's fallbacks for the two
 * optional ones, and the mode its own file declares.
 *
 * @param {{ id: string, name: string, mode: "light" | "dark" }} entry
 */
export function loadPalette(entry) {
  const source = `vendor/omarchy/${entry.id}/colors.toml`;
  const raw = parseToml(
    readFileSync(join(VENDOR, entry.id, "colors.toml"), "utf8"),
    source,
  );
  if (raw.mode !== "light" && raw.mode !== "dark") {
    throw new Error(`${source}: mode must be "light" or "dark"`);
  }
  if (raw.mode !== entry.mode) {
    throw new Error(
      `${source}: declares mode "${raw.mode}", the palette library groups it as "${entry.mode}"`,
    );
  }
  for (const key of REQUIRED) {
    if (raw[key] === undefined) throw new Error(`${source}: missing "${key}"`);
  }
  const orange = raw.orange ?? raw.yellow;
  const brown = raw.brown ?? formatColor(mix(orange, "#000000", 0.5));
  /** @type {Record<string, string>} */
  const hues = { orange, brown };
  for (const key of REQUIRED) hues[key] = raw[key];
  for (const key of [...REQUIRED, ...OPTIONAL]) {
    parseColor(hues[key]);
  }
  return { id: entry.id, name: entry.name, mode: raw.mode, ...hues };
}
